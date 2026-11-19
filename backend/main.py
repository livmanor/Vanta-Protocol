import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.auth.middleware import SessionAuthMiddleware
from backend.auth.sessions import ensure_bootstrap_officer
from backend.config import settings
from backend.data_sources.cap_alerts import start_cap_poller, stop_cap_poller
from backend.data_sources.htp_waterlogging import start_htp_poller, stop_htp_poller
from backend.db import init_db
from backend.routers import risk, routes, units, incidents, sources, weather, agents, predict_history, operations, auth, alerts, replay

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("vanta")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Vanta Protocol database...")
    await init_db()
    await ensure_bootstrap_officer()
    start_cap_poller()
    start_htp_poller()
    logger.info("Database initialized successfully.")
    yield
    stop_cap_poller()
    stop_htp_poller()
    logger.info("Shutting down Vanta Protocol backend.")

app = FastAPI(
    title="Vanta Protocol API",
    description="Real-time disaster-response planning tool for police control rooms (CipherCop 2026)",
    version="1.0.0",
    lifespan=lifespan
)

# Local Vite origins by default. Override CORS_ORIGINS in .env for a deployed UI.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Auth runs after CORS so preflight still succeeds.
app.add_middleware(SessionAuthMiddleware)

# Register routes
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(risk.router)
app.include_router(routes.router)
app.include_router(units.router)
app.include_router(incidents.router)
app.include_router(sources.router)
app.include_router(weather.router)
app.include_router(agents.router)
app.include_router(predict_history.router)
app.include_router(operations.router)
app.include_router(replay.router)

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

