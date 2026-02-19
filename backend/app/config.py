from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://pool:password@postgres:5432/pooldb"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    refresh_token_expire_days: int = 7

    pool_name: str = "My Pool"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
