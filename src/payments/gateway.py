# CLAW Payments Module
# Handles Coinbase Pay, MoonPay, and ThorChain flows
# Future: add credit card & ERC20 gas payment integration
class PaymentGateway:
    def __init__(self):
        self.supported = ['Coinbase Pay', 'MoonPay', 'ThorChain']

    def process_payment(self, method, amount):
        if method in self.supported:
            print(f'Processing {amount} via {method}')
        else:
            raise ValueError('Unsupported payment method')

