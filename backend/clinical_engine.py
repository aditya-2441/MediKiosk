"""Typed clinical intake state machine for the MediKiosk interview flow."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InterviewPhase(str, Enum):
    GREETING = "greeting"
    DEMOGRAPHICS = "demographics"
    CHIEF_COMPLAINT = "chief_complaint"
    SOCRATES = "socrates"
    DASHAVIDHA_PARIKSHA = "dashavidha_pariksha"
    MEDICATIONS_AND_HISTORY = "medications_and_history"
    REVIEW = "review"
    PRIORITY_BYPASS = "priority_bypass"
    COMPLETE = "complete"


class SocratesHistory(BaseModel):
    """Allopathic symptom history using the SOCRATES framework."""

    site: str | None = None
    onset: str | None = None
    character: str | None = None
    radiation: str | None = None
    associations: list[str] = Field(default_factory=list)
    timing: str | None = None
    exacerbating_factors: list[str] = Field(default_factory=list)
    relieving_factors: list[str] = Field(default_factory=list)
    severity: int | None = Field(default=None, ge=0, le=10)


class DashavidhaPariksha(BaseModel):
    """Ayurvedic ten-fold examination fields relevant to a kiosk intake."""

    prakriti: str | None = None
    vikriti: str | None = None
    sara: str | None = None
    samhanana: str | None = None
    pramana: str | None = None
    satmya: str | None = None
    sattva: str | None = None
    ahara_shakti: str | None = None
    vyayama_shakti: str | None = None
    vaya: str | None = None
    agni: str | None = None
    ahara_vihara: list[str] = Field(default_factory=list)


class Demographics(BaseModel):
    name: str | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    sex: str | None = None
    preferred_language: str | None = None
    contact_number: str | None = None


class ClinicalHistory(BaseModel):
    demographics: Demographics = Field(default_factory=Demographics)
    chief_complaint: str | None = None
    socrates: SocratesHistory = Field(default_factory=SocratesHistory)
    dashavidha_pariksha: DashavidhaPariksha = Field(default_factory=DashavidhaPariksha)
    past_medical_history: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    family_history: list[str] = Field(default_factory=list)
    social_history: list[str] = Field(default_factory=list)


class ClinicalInterviewState(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    session_id: str
    phase: InterviewPhase = InterviewPhase.GREETING
    history: ClinicalHistory = Field(default_factory=ClinicalHistory)
    red_flags: list[str] = Field(default_factory=list)
    priority_bypass: bool = False
    transcript: list[str] = Field(default_factory=list)
    audio_bytes_received: int = Field(default=0, ge=0)

    @field_validator("red_flags")
    @classmethod
    def unique_red_flags(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(flag.strip() for flag in value if flag.strip()))

    def add_red_flags(self, flags: list[str]) -> None:
        self.red_flags = list(dict.fromkeys([*self.red_flags, *flags]))
        if self.red_flags:
            self.priority_bypass = True
            self.phase = InterviewPhase.PRIORITY_BYPASS


class ClinicalInterviewStateMachine:
    """Deterministic FSM that keeps the interview safe and resumable."""

    _phase_order = [
        InterviewPhase.GREETING,
        InterviewPhase.DEMOGRAPHICS,
        InterviewPhase.CHIEF_COMPLAINT,
        InterviewPhase.SOCRATES,
        InterviewPhase.DASHAVIDHA_PARIKSHA,
        InterviewPhase.MEDICATIONS_AND_HISTORY,
        InterviewPhase.REVIEW,
        InterviewPhase.COMPLETE,
    ]
    _red_flag_phrases: dict[str, tuple[str, ...]] = {
        "chest pain": ("chest pain", "pressure in chest", "tightness in chest"),
        "stroke symptoms": ("face drooping", "speech difficulty", "unable to speak", "one-sided weakness"),
        "severe breathing difficulty": ("cannot breathe", "can't breathe", "severe breathlessness"),
        "loss of consciousness": ("passed out", "lost consciousness", "unconscious"),
        "severe bleeding": ("uncontrolled bleeding", "bleeding heavily", "blood won't stop"),
        "suicidal thoughts": ("want to die", "suicidal", "kill myself"),
    }

    def __init__(self, session_id: str):
        self.state = ClinicalInterviewState(session_id=session_id)

    def add_audio_bytes(self, byte_count: int) -> ClinicalInterviewState:
        if byte_count < 0:
            raise ValueError("byte_count cannot be negative")
        self.state.audio_bytes_received += byte_count
        return self.state

    def ingest_transcript(self, text: str) -> ClinicalInterviewState:
        normalized = " ".join(text.lower().split())
        if not normalized:
            return self.state
        self.state.transcript.append(text.strip())
        detected = [
            label
            for label, phrases in self._red_flag_phrases.items()
            if any(phrase in normalized for phrase in phrases)
        ]
        if detected:
            self.state.add_red_flags(detected)
        return self.state

    def advance(self) -> ClinicalInterviewState:
        if self.state.priority_bypass:
            return self.state
        current_index = self._phase_order.index(self.state.phase)
        if current_index < len(self._phase_order) - 1:
            self.state.phase = self._phase_order[current_index + 1]
        return self.state

    def snapshot(self) -> dict[str, Any]:
        return self.state.model_dump(mode="json")
