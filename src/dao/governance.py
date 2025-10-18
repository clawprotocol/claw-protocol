# CLAW DAO Module
# Treasury management, affiliate rewards, and governance
class DAO:
    def __init__(self):
        self.treasury_balance = 100000
        self.affiliate_pool = 10000
        self.vote_weight = {}

    def register_member(self, member, weight):
        self.vote_weight[member] = weight

    def distribute_affiliate_rewards(self, percent):
        reward = self.affiliate_pool * (percent / 100)
        print(f'Distributed {reward} CLAW to affiliates')

