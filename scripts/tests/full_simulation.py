import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

# CLAW Integrated Simulation Script
# Tests DAO, Payments, and Treasury module interaction

from src.core.treasury import Treasury
from src.dao.governance import DAO
from src.payments.gateway import PaymentGateway

def run_simulation():
    print('=== CLAW Protocol Simulation Start ===')

    # Initialize modules
    treasury = Treasury()
    dao = DAO()
    payments = PaymentGateway()

    # Step 1: Mint CLAW into treasury
    treasury.mint(100000)
    print(f'Treasury minted CLAW: {treasury.reserve_balance} total')

    # Step 2: Process a payment
    payments.process_payment('Coinbase Pay', 1000)

    # Step 3: Register a member and distribute affiliate rewards
    dao.register_member('Jeremy', weight=10)
    dao.distribute_affiliate_rewards(percent=5)

    print(f'Treasury Reserve: {treasury.reserve_balance} | DAO Affiliate Pool: {dao.affiliate_pool}')
    print('=== Simulation Complete ===')

if __name__ == '__main__':
    run_simulation()

