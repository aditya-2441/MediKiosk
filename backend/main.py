"""FastAPI entry point for the MediKiosk clinical intake service."""

from __future__ import annotations

import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from clinical_engine import ClinicalInterviewStateMachine

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("medikiosk")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("MediKiosk clinical intake service started")
    yield
    logger.info("MediKiosk clinical intake service stopped")


app = FastAPI(title="MediKiosk Clinical Intake API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/audio-stream")
async def audio_stream(websocket: WebSocket) -> None:
    """Receive binary signed PCM frames captured at 8000 Hz.

    Raw PCM has no header, so the client is responsible for configuring 8000 Hz.
    The optional JSON messages carry transcript text or an explicit phase advance.
    """

    await websocket.accept()
    machine = ClinicalInterviewStateMachine(session_id=str(uuid4()))
    await websocket.send_json({"type": "session_started", "session_id": machine.state.session_id})
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            audio_chunk = message.get("bytes")
            if audio_chunk is not None:
                machine.add_audio_bytes(len(audio_chunk))
                await websocket.send_json(
                    {
                        "type": "audio_ack",
                        "bytes_received": machine.state.audio_bytes_received,
                        "priority_bypass": machine.state.priority_bypass,
                    }
                )
                continue

            text_message = message.get("text")
            if text_message is None:
                continue
            try:
                event = json.loads(text_message)
            except json.JSONDecodeError:
                event = {"type": "transcript", "text": text_message}
            if event.get("type") == "transcript":
                machine.ingest_transcript(str(event.get("text", "")))
            elif event.get("type") == "advance":
                machine.advance()
            await websocket.send_json({"type": "state", "state": machine.snapshot()})
    except WebSocketDisconnect:
        logger.info("Audio session %s disconnected", machine.state.session_id)
