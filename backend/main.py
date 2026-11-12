import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
from backend.db import init_db
from backend.routers import risk, routes, units, incidents, sources, weather, agents

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("vanta")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Vanta Protocol database...")
    await init_db()
    logger.info("Database initialized successfully.")
    yield
    logger.info("Shutting down Vanta Protocol backend.")

app = FastAPI(
    title="Vanta Protocol API",
    description="Real-time disaster-response planning tool for police control rooms (CipherCop 2026)",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(risk.router)
app.include_router(routes.router)
app.include_router(units.router)
app.include_router(incidents.router)
app.include_router(sources.router)
app.include_router(weather.router)
app.include_router(agents.router)

@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": "Vanta Protocol",
        "version": "1.0.0",
        "city": settings.CITY_NAME
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)

