"""Validate the planned API document; these are not runtime endpoint tests.

Vendored metaschema source: https://spec.openapis.org/oas/3.0/schema/2024-10-18
Its id is retained in schemas/openapi-3.0.json for provenance/offline validation.
"""

from copy import deepcopy
import json
from pathlib import Path
import re

import jsonschema
import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
DOCUMENT = yaml.safe_load((ROOT / "openapi.yml").read_text())


def expand(value):
    """Convert acyclic OpenAPI 3.0 schemas to JSON Schema for example checks."""
    if isinstance(value, list):
        return [expand(item) for item in value]
    if not isinstance(value, dict):
        return value
    value = deepcopy(value)
    if "$ref" in value:
        target = DOCUMENT
        for name in value.pop("$ref").removeprefix("#/").split("/"):
            target = target[name]
        value = deepcopy(target) | value
    value = {key: expand(child) for key, child in value.items()}
    if value.pop("nullable", False) and "type" in value:
        value["type"] = [value["type"], "null"]
    return value


def operations():
    for path, methods in DOCUMENT["paths"].items():
        for method, operation in methods.items():
            yield path, method, operation


def test_planned_document_validates_offline_and_references_resolve():
    meta = json.loads((Path(__file__).parent / "schemas/openapi-3.0.json").read_text())
    jsonschema.validators.validator_for(meta)(meta).validate(DOCUMENT)
    expand(DOCUMENT)  # Missing local references fail rather than being ignored.
    ids = [operation["operationId"] for _, _, operation in operations()]
    assert len(ids) == len(set(ids))
    for path, _, operation in operations():
        names = set(re.findall(r"\{(\w+)\}", path))
        declared = {item["name"] for item in operation.get("parameters", []) if item["in"] == "path"}
        assert names == declared, path


@pytest.mark.parametrize("path,method,operation", list(operations()), ids=lambda value: value if isinstance(value, str) else value["operationId"])
def test_all_contract_response_examples_match_declared_schemas(path, method, operation):
    for response in operation["responses"].values():
        for media in response.get("content", {}).values():
            validator = jsonschema.Draft4Validator(expand(media["schema"]), format_checker=jsonschema.FormatChecker())
            for example in media.get("examples", {}).values():
                validator.validate(example["value"])


def test_public_contract_has_private_proof_and_retry_failures():
    join = DOCUMENT["paths"]["/api/queues/{queueId}/tickets"]["post"]
    assert {"200", "201", "409", "422", "503"} <= join["responses"].keys()
    assert {"closed", "retryConflict", "tokenReused"} <= join["responses"]["409"]["content"]["application/json"]["examples"].keys()
    assert any(parameter["in"] == "header" and parameter["name"] == "Idempotency-Key" and parameter["required"] for parameter in join["parameters"])
    body = expand(join["requestBody"]["content"]["application/json"]["schema"])
    assert set(body["properties"]) == {"accessToken"}
    assert body["additionalProperties"] is False
    for path in ("/api/tickets/{token}", "/api/tickets/{token}/cancel"):
        for operation in DOCUMENT["paths"][path].values():
            assert operation["security"] == []
            assert "invalidToken" in operation["responses"]["404"]["content"]["application/json"]["examples"]
    assert "DESIGN CONTRACT" in DOCUMENT["info"]["description"]
