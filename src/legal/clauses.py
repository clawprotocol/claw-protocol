# CLAW Legal Clauses Module
# DAO Lawyer-authored clauses, attestations, and reuse tracking.
class ClauseRegistry:
    def __init__(self):
        self.clauses = {}

    def register_clause(self, clause_id, author):
        self.clauses[clause_id] = {'author': author, 'reuse_count': 0}

    def reuse_clause(self, clause_id):
        if clause_id in self.clauses:
            self.clauses[clause_id]['reuse_count'] += 1

