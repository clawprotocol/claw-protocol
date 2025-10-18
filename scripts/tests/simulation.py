# CLAW Simulation Script
# Used to test treasury economics, DAO behavior, and throughput.
from src.core.treasury import Treasury

def simulate_treasury():
    t = Treasury()
    t.mint(100000)
    t.burn(10000)
    print(f'Reserve: {t.reserve_balance}, Circulating: {t.circulating_supply}')

if __name__ == '__main__':
    simulate_treasury()

