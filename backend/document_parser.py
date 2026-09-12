"""Gemini-powered extraction of clinical facts from uploaded documents."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from fastapi import UploadFile
from google import genai
from google.genai import types
from pydantic import BaseModel, Field


class MedicationExtraction(BaseModel):
    name: str
    dosage: str | None = None
    route: str | None = None
    frequency: str | None = None
    duration: str | None = None


class LabResultExtraction(BaseModel):
    test_name: str
    value: str
    unit: str | None = None
    reference_range: str | None = None
    out_of_range: bool = False


class ClinicalDocumentExtraction(BaseModel):
    diagnoses: list[str] = Field(default_factory=list)
    medications: list[MedicationExtraction] = Field(default_factory=list)
    lab_results: list[LabResultExtraction] = Field(default_factory=list)


_EXTRACTION_PROMPT = """You are extracting structured clinical facts from an Indian patient's prescription or laboratory report.
Return only valid JSON matching this exact shape:
{
  \"diagnoses\": [\"string\"],
  \"medications\": [{\"name\": \"string\", \"dosage\": \"string or null\", \"route\": \"string or null\", \"frequency\": \"string or null\", \"duration\": \"string or null\"}],
  \"lab_results\": [{\"test_name\": \"string\", \"value\": \"string\", \"unit\": \"string or null\", \"reference_range\": \"string or null\", \"out_of_range\": true}]
}
Preserve dosage, units, frequency, and duration exactly when visible. Set out_of_range to true only when the report explicitly marks the result abnormal or the numeric result is outside its stated reference range. Do not invent values; omit unreadable facts.
"""


def _json_from_response(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1)
    payload = json.loads(cleaned)
    if not isinstance(payload, dict):
        raise ValueError("Gemini returned a non-object document payload")
    return payload


async def parse_document_upload(upload: UploadFile) -> ClinicalDocumentExtraction:
    """Read one multipart upload and map Gemini's extraction into typed clinical data."""

    image_bytes = await upload.read()
    if not image_bytes:
        raise ValueError("The uploaded document is empty")
    mime_type = upload.content_type or "image/jpeg"
    return await parse_document_bytes(image_bytes, mime_type)


async def parse_document_bytes(image_bytes: bytes, mime_type: str) -> ClinicalDocumentExtraction:
    """Extract diagnoses, medications, and lab results from an image using Gemini."""

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    if not mime_type.startswith(("image/", "application/pdf")):
        raise ValueError("Only image and PDF clinical documents are supported")

    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            _EXTRACTION_PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0,
        ),
    )
    response_text = response.text
    if not response_text:
        raise ValueError("Gemini returned an empty document extraction")
    return ClinicalDocumentExtraction.model_validate(_json_from_response(response_text))
