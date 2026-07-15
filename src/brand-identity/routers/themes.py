from fastapi import APIRouter, Depends, Query
from core.security import get_current_user
from services.color_service import color_service
from services.ai_service import ai_service

router = APIRouter(prefix="/themes", tags=["themes"])


@router.get("/palette")
async def get_palette_from_primary(
    primary_color: str = Query(..., description="Primary hex colour e.g. #001F3F"),
    user_id: str = Depends(get_current_user),
):
    palette = color_service.generate_palette(primary_color)
    return {"palette": palette}


@router.post("/palette/suggest")
async def suggest_palette_with_ai(
    primary_color: str,
    sector: str,
    user_id: str = Depends(get_current_user),
):
    suggestion = await ai_service.suggest_palette(primary_color, sector)
    return {"suggestion": suggestion}
