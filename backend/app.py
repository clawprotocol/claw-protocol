from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import fitz  # PyMuPDF for PDF
import docx
from pydantic import BaseModel
import uvicorn
import openai

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractResponse(BaseModel):
    clauses: list

def extract_text_from_pdf(path):
    doc = fitz.open(path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def extract_text_from_docx(path):
    d = docx.Document(path)
    return "\n".join([p.text for p in d.paragraphs])

@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    suffix = file.filename.lower()

    # Save temp file
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    # PDF or DOCX
    if suffix.endswith(".pdf"):
        full_text = extract_text_from_pdf(tmp_path)
    elif suffix.endswith(".docx"):
        full_text = extract_text_from_docx(tmp_path)
    else:
        return {"error": "Unsupported file format."}

    # Ask GPT to extract structured clauses
    prompt = f"""
    Extract the legal clauses from this document.
    Return them as a JSON list of clauses, each clause short and human-readable.

    Document:
    {full_text}
    """

    completion = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    try:
        clauses = completion.choices[0].message["content"]
        return {"clauses": clauses}
    except:
        return {"clauses": ["Extraction failed."]}


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=3001, reload=True)
