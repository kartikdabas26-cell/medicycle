import io
import csv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import Base, get_db
from backend.app.models import Batch, Facility, InventoryItem, Medicine

client = TestClient(app)

def test_inventory_csv_export_headers_and_content():
    """Verify inventory CSV export returns proper non-chunked response with exact headers."""
    res = client.get('/api/inventory/export/csv?surge_pct=0')
    assert res.status_code == 200
    assert 'text/csv' in res.headers.get('content-type', '')
    assert 'attachment; filename="medicycle_inventory_' in res.headers.get('content-disposition', '')
    assert 'content-length' in res.headers
    assert int(res.headers['content-length']) == len(res.content)
    assert res.headers.get('cache-control') == 'no-cache, no-store, must-revalidate'

    # Verify content is valid CSV
    reader = list(csv.reader(io.StringIO(res.text)))
    assert len(reader) > 1
    headers = reader[0]
    assert 'Inventory_ID' in headers
    assert 'Current_Stock' in headers
    assert 'Medicine_Name' in headers

def test_repeated_inventory_export_requests():
    """Verify rapid repeated download requests succeed without hanging or truncation."""
    for _ in range(5):
        res = client.get('/api/inventory/export/csv?surge_pct=0')
        assert res.status_code == 200
        assert int(res.headers['content-length']) == len(res.content)

def test_inventory_csv_template():
    """Verify inventory CSV template download endpoint."""
    res = client.get('/api/inventory/template/csv')
    assert res.status_code == 200
    assert 'attachment; filename="medicycle_inventory_template.csv"' in res.headers.get('content-disposition', '')
    assert 'content-length' in res.headers
    reader = list(csv.reader(io.StringIO(res.text)))
    assert len(reader) >= 2
    assert 'Inventory_ID' in reader[0]
    assert 'Current_Stock' in reader[0]

def test_inventory_csv_import_roundtrip():
    """Verify exported CSV can be imported and updates the database cleanly."""
    export_res = client.get('/api/inventory/export/csv?surge_pct=0')
    assert export_res.status_code == 200

    import_res = client.post(
        '/api/inventory/import/csv',
        files={'file': ('inventory.csv', io.BytesIO(export_res.content), 'text/csv')}
    )
    assert import_res.status_code == 200
    data = import_res.json()
    assert data['status'] == 'success'
    assert data['updated_records'] > 0

def test_inventory_csv_import_validations():
    """Verify input safeguards: negative stock, invalid dates, and missing required columns."""
    # 1. Missing required Current_Stock column
    bad_cols = "Inventory_ID,Safety_Stock\nINV-FAC-001-MED-001,50\n"
    res1 = client.post(
        '/api/inventory/import/csv',
        files={'file': ('bad.csv', io.BytesIO(bad_cols.encode('utf-8')), 'text/csv')}
    )
    assert res1.status_code == 400
    assert "Missing required column 'Current_Stock'" in res1.json()['detail']

    # 2. Negative stock value
    bad_stock = "Inventory_ID,Current_Stock\nINV-FAC-001-MED-001,-30\n"
    res2 = client.post(
        '/api/inventory/import/csv',
        files={'file': ('bad_stock.csv', io.BytesIO(bad_stock.encode('utf-8')), 'text/csv')}
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert any('cannot be negative' in err for err in data2.get('errors', []))

    # 3. Invalid date format
    bad_date = "Inventory_ID,Current_Stock,Expiry_Date\nINV-FAC-001-MED-001,100,2026/12/31\n"
    res3 = client.post(
        '/api/inventory/import/csv',
        files={'file': ('bad_date.csv', io.BytesIO(bad_date.encode('utf-8')), 'text/csv')}
    )
    assert res3.status_code == 200
    data3 = res3.json()
    assert any('Expiry_Date must be formatted as YYYY-MM-DD' in err for err in data3.get('errors', []))

def test_transfers_and_reorder_export_headers():
    """Verify transfer and reorder exports have non-chunked, measured responses."""
    r_tr_csv = client.get('/api/transfers/export/csv?surge_pct=0')
    assert r_tr_csv.status_code == 200
    assert 'content-length' in r_tr_csv.headers

    r_tr_pdf = client.get('/api/transfers/export/pdf?surge_pct=0')
    assert r_tr_pdf.status_code == 200
    assert 'content-length' in r_tr_pdf.headers

    r_re_csv = client.get('/api/reorder/export/csv?horizon_days=14&surge_pct=0')
    assert r_re_csv.status_code == 200
    assert 'content-length' in r_re_csv.headers

def test_transfer_approval_rejects_malformed_or_unknown_recommendations_cleanly():
    missing_payload = client.post('/api/transfers/approve', json={})
    assert missing_payload.status_code == 422

    unknown_recommendation = client.post('/api/transfers/approve', json={
        'source_facility_id': 'missing-source',
        'dest_facility_id': 'missing-destination',
        'medicine_id': 'missing-medicine',
        'suggested_quantity': 1,
        'source_facility_name': 'Missing Source',
        'dest_facility_name': 'Missing Destination',
    })
    assert unknown_recommendation.status_code == 400
    assert unknown_recommendation.json()['detail'] == 'Source or destination inventory record not found'

def test_transfer_approval_executes_against_isolated_database():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestSession()
    db.add_all([
        Facility(id='TEST-SOURCE', name='Test Source', facility_type='Tertiary', location='Test'),
        Facility(id='TEST-DEST', name='Test Destination', facility_type='Community', location='Test'),
        Medicine(id='TEST-MED', name='Test Medicine', generic_name='Test', category='Test',
                 dosage_form='Tablet', unit='tablets'),
        InventoryItem(id='TEST-SOURCE-ITEM', facility_id='TEST-SOURCE', medicine_id='TEST-MED', current_stock=100),
        InventoryItem(id='TEST-DEST-ITEM', facility_id='TEST-DEST', medicine_id='TEST-MED', current_stock=10),
    ])
    db.flush()
    db.add(Batch(id='TEST-BATCH', inventory_item_id='TEST-SOURCE-ITEM', batch_number='TEST-BATCH',
                 quantity=100, expiry_date='2027-12-31'))
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        response = client.post('/api/transfers/approve', json={
            'source_facility_id': 'TEST-SOURCE',
            'dest_facility_id': 'TEST-DEST',
            'medicine_id': 'TEST-MED',
            'suggested_quantity': 30,
            'source_facility_name': 'Test Source',
            'dest_facility_name': 'Test Destination',
        })
        assert response.status_code == 200
        assert response.json()['status'] == 'success'
        check = TestSession()
        assert check.get(InventoryItem, 'TEST-SOURCE-ITEM').current_stock == 70
        assert check.get(InventoryItem, 'TEST-DEST-ITEM').current_stock == 40
        check.close()
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_inventory_pdf_export_endpoint():
    """Verify inventory PDF export endpoint returns valid application/pdf with %PDF signature."""
    res = client.get('/api/inventory/export/pdf?surge_pct=0')
    assert res.status_code == 200
    assert 'application/pdf' in res.headers.get('content-type', '')
    assert 'attachment; filename="medicycle_inventory_' in res.headers.get('content-disposition', '')
    assert 'content-length' in res.headers
    assert int(res.headers['content-length']) == len(res.content)
    assert res.content.startswith(b'%PDF')


def test_inventory_pdf_export_with_facility_and_risk_filter():
    """Verify inventory PDF export works with facility_id and risk_level parameters."""
    res = client.get('/api/inventory/export/pdf?facility_id=FAC-001&risk_level=Critical&surge_pct=25')
    assert res.status_code == 200
    assert 'application/pdf' in res.headers.get('content-type', '')
    assert res.content.startswith(b'%PDF')

