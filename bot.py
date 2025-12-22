# bot.py

import os

from dotenv import load_dotenv
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    filters,
)

from utils.logger import logger
from handlers.start import start_handler
from handlers.help import help_handler
from handlers.clause_extract import clause_extract_handler
from handlers.proof_handler import proof_handler
from handlers.sign_flow import sign_handler
from handlers.contract_upload import file_upload_handler


load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
BOT_MODE = os.getenv("BOT_MODE", "polling").lower()


async def unknown_handler(update, context):
    if update.message:
        await update.message.reply_text(
            "I didn’t quite get that. Try /help for options."
        )


def main():
    logger.info("🔧 Initializing CLAW Bot…")

    application = ApplicationBuilder().token(TOKEN).build()

    # Commands
    application.add_handler(CommandHandler("start", start_handler))
    application.add_handler(CommandHandler("help", help_handler))
    application.add_handler(CommandHandler("extract", clause_extract_handler))
    application.add_handler(CommandHandler("proof", proof_handler))
    application.add_handler(CommandHandler("sign", sign_handler))

    # File uploads (PDF/DOCX)
    application.add_handler(
    MessageHandler(
        filters.Document.PDF | filters.Document.DOCX,
        file_upload_handler,
    )
)

    # Fallback
    application.add_handler(MessageHandler(filters.ALL, unknown_handler))

    logger.info(f"🤖 CLAW Bot running in {BOT_MODE.upper()} mode (polling)…")
    application.run_polling()


if __name__ == "__main__":
    main()
