from flask import jsonify

from backend.api.blueprint import api_bp
from backend.publishing import connected_platform_rows


@api_bp.get("/publishing/connected-platforms")
def list_connected_platforms():
    return jsonify(platforms=connected_platform_rows())
