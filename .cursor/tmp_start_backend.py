from pathlib import Path

from dotenv import load_dotenv
import uvicorn

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=True)

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
