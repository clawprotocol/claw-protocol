import pytest
from fastapi.testclient import TestClient

from backend.main import app

pytestmark = pytest.mark.unit


def test_api_agreements_v2_create_update_render_no_template_leakage():
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        json={
            "title": "Consulting Agreement",
            "jurisdiction": "Texas",
            "parties": [
                {"name": "Acme Inc", "role": "Client"},
                {"name": "John Smith", "role": "Consultant"},
            ],
            "purpose": "Financial modeling services",
            "payment_terms": "$500 on signing and $2000 on delivery",
            "duration": None,
            "due_date": "March 15, 2026",
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    body = create_res.json()
    agreement_id = body["id"]
    assert agreement_id

    update_res = client.post(
        f"/api/agreements/{agreement_id}/update-field",
        json={"field": "effective_date", "value": "2026-03-01"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["draft"]["effective_date"] == "2026-03-01"

    render_res = client.post(f"/api/agreements/{agreement_id}/render")
    assert render_res.status_code == 200
    html = render_res.json()["rendered_html"]
    assert "Template Body: true" not in html
    assert "Template Body: false" not in html
    assert "is_template_body" not in html
