import os
import json
from pydantic import BaseModel, Field
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Define the exact data structure we want Gemini to extract
class DocumentExtractionResult(BaseModel):
    document_type: str = Field(description="E.g., Prescription, Lab Report, Medical Bill, Unknown")
    summary: str = Field(description="A brief 1-2 sentence clinical summary of the document.")
    key_findings: list[str] = Field(description="Diagnoses, abnormal test values, or important doctor notes.")
    medications: list[str] = Field(description="List of medications, dosages, and instructions if present.")

async def parse_medical_document(image_bytes: bytes, mime_type: str) -> DocumentExtractionResult:
    """
    Takes an uploaded image/document, sends it to Gemini 1.5 Flash Vision, 
    and returns a structured JSON clinical summary.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing from the environment variables.")
    
    genai.configure(api_key=api_key)
    
    # Gemini 1.5 Flash is highly optimized for multimodal OCR and speed
    model = genai.GenerativeModel('gemini-3.6-flash')
    
    prompt = """
    You are an expert clinical data extractor. Carefully read the uploaded medical document (which may contain messy handwriting).
    Extract the clinical information strictly adhering to the requested schema. 
    If a specific field (like medications) is not present in the document, return an empty list.
    """
    
    image_parts = [
        {
            "mime_type": mime_type,
            "data": image_bytes
        }
    ]
    
    # Force the model to output strict JSON matching our Pydantic schema
    response = model.generate_content(
        [prompt, image_parts[0]],
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=DocumentExtractionResult,
            temperature=0.1
        )
    )
    
    # Parse the guaranteed JSON response into our Pydantic model
    result_dict = json.loads(response.text)
    return DocumentExtractionResult(**result_dict)