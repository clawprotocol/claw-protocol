from services.backend_api import start_proof_packet

async def proof_flow_handler(update, context):
    await update.message.reply_text("📦 Building Proof Packet…")

    result = start_proof_packet()

    await update.message.reply_text(
        f"✅ Proof Packet Created\nID: {result.get('packetId', 'UNKNOWN')}"
    )
