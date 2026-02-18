from pydantic import BaseModel


class SettingResponse(BaseModel):
    key: str
    value: str

    model_config = {"from_attributes": True}


class SettingsUpdateRequest(BaseModel):
    settings: dict[str, str]
