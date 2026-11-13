from backend.config import settings

value = settings.GROQ_API_KEY.get_secret_value() if settings.GROQ_API_KEY else ""
print("len", len(value))
print("has_whitespace", value != value.strip())
print("prefix_ok", value.strip().startswith("gsk_"))
print("starts_with_quote", value[:1] in {"'", '"'})
print("in_dotenv_file", False)
