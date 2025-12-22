async def help_handler(update, context):
    await update.message.reply_text(
        "📘 Help Menu\n\n"
        "• Upload contracts (PDF/DOC)\n"
        "• /extract – Extract clauses\n"
        "• /proof – Build a Proof Packet\n"
        "• /sign – Signature workflow\n"
    )
