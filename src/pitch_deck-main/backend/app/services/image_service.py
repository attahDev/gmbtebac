
import os
import logging
import hashlib
import requests
from app.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = "media/img_cache"
UNSPLASH_API = "https://api.unsplash.com/search/photos"

SLIDE_IMAGE_QUERIES = {
    "Cover": None,          
    "Problem": "problem frustration challenge",
    "Solution": "technology innovation solution",
    "Team": "professional team business",
    "Thank You": "success celebration future",
}


def _cache_path(url: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{key}.jpg")


def fetch_unsplash_image(query: str) -> str | None:
    if not settings.UNSPLASH_ACCESS_KEY:
        return None

    try:
        resp = requests.get(
            UNSPLASH_API,
            params={"query": query, "per_page": 1, "orientation": "landscape"},
            headers={"Authorization": f"Client-ID {settings.UNSPLASH_ACCESS_KEY}"},
            timeout=8,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return None

        img_url = results[0]["urls"]["regular"]
        return _download_image(img_url)

    except Exception as e:
        logger.warning(f"Unsplash fetch failed for '{query}': {e}")
        return None


def _download_image(url: str) -> str | None:
    path = _cache_path(url)
    if os.path.exists(path):
        return path
    try:
        r = requests.get(url, timeout=15, stream=True)
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return path
    except Exception as e:
        logger.warning(f"Image download failed: {e}")
        return None


def download_image_from_url(source: str) -> str | None:
    
    if not source.startswith(("http://", "https://")):
        if os.path.exists(source):
            return source
        logger.warning(f"Local image path not found: {source}")
        return None
    return _download_image(source)


def fetch_slide_images(slides: list, company_keywords: str = "") -> dict:
    images = {}
    for slide in slides:
        title = slide.get("title", "")
        if title not in SLIDE_IMAGE_QUERIES:
            continue

        query = SLIDE_IMAGE_QUERIES[title]
        if query is None:
            query = company_keywords or "startup business technology"

        path = fetch_unsplash_image(query)
        if path:
            images[slide["slide_number"]] = path
            logger.info(f"Image fetched for slide {slide['slide_number']} ({title})")

    return images
