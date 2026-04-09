# handlers/sign_flow.py

from telegram import Update
from telegram.ext import ContextTypes

from services.backend_api import start_signing
from utils.logger import logger


async def sign_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /sign — builds a signing packet from the last extracted clauses.
    For now we assume the Telegram user is the signer.
    """

    clauses = context.user_data.get("last_clauses")

    if not clauses:
        await update.message.reply_text(
            "I don’t see any extracted clauses yet.\n\n"
            "👉 Please upload a contract and run /extract first, "
            "then run /sign."
        )
        return

    user = update.effective_user
    signer_name = user.full_name or user.username or f"user_{user.id}"
    signer_id = user.id

    logger.info("Starting signing flow signer_id=%s", signer_id)

    await update.message.reply_text(
        "✍️ Preparing a signing packet based on your last extracted clauses…"
    )

    try:
        result = await start_signing(clauses, signer_name, signer_id)
    except Exception:
        await update.message.reply_text(
            "❌ Backend service error. Unable to create signing packet."
        )
        return

    packet = result.get("sign_packet") or {}

    doc_hash = packet.get("doc_hash")
    sign_id = packet.get("sign_id")
    signed_at = packet.get("signed_at")

    # Store the packet for future flows (anchor, countersign, etc.)
    context.user_data["last_sign_packet"] = packet

    text_lines = [
        "✅ *Signing Packet Created*",
        "",
        f"*Signer:* {signer_name}",
        f"*Sign ID:* `{sign_id}`" if sign_id else None,
        f"*Doc Hash:* `{doc_hash}`" if doc_hash else None,
        f"*Signed At (UTC):* {signed_at}" if signed_at else None,
        "",
        "_This is a CLAW-style signing packet. In future versions, "
        "this will be anchored on-chain and shareable with other parties._",
    ]

    # filter out Nones
    msg = "\n".join([line for line in text_lines if line is not None])

    await update.message.reply_text(msg, parse_mode="Markdown")
