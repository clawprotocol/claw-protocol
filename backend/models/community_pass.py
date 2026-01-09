# backend/models/community_pass.py

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

Chain = Literal["bitcoin", "base", "ethereum", "solana"]
VerificationMethod = Literal["nft_hold", "allowlist", "signed_claim"]
TokenRuleMode = Literal["any", "specific_ids", "min_balance"]

class TokenRule(BaseModel):
    mode: TokenRuleMode
    specific_ids: Optional[List[str]] = None
    min_balance: Optional[int] = None

class LinkedIdentity(BaseModel):
    x_profile_enabled: bool = False
    method: Optional[Literal["oauth", "signed_message"]] = None

class CommunityPerks(BaseModel):
    daily_signature_boost: int = 0
    badge_id: Optional[str] = None
    share_card_theme: Optional[str] = None
    batch_priority: int = 0  # 0 = normal, 1 = priority-in-batch

class CommunityPass(BaseModel):
    community_id: str
    chain: Chain
    verification_method: VerificationMethod

    collection_address: str
    token_rule: TokenRule

    linked_identity: Optional[LinkedIdentity] = None
    perks: CommunityPerks

    issued_at: datetime
    expires_at: Optional[datetime] = None
