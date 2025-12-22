async def start_handler(update, context):
    await update.message.reply_text(
        "👋 Welcome to CLAW Bot!\n\n"
        "Upload a contract file (PDF/DOCX) or try:\n"
        "/extract – Extract clauses\n"
        "/proof – Generate a Proof Packet\n"
        "/sign – Start a signing workflow\n"
        "/help – Help menu\n"
    )
