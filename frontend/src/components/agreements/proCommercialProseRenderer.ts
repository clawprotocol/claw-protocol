export type ProCommercialPartyContext = {
  clientLegalName?: string | null;
  serviceProviderLegalName?: string | null;
  clientRoleLabel?: string | null;
  serviceProviderRoleLabel?: string | null;
  partiesLabel?: string | null;
};

export type ProCommercialProseContext = ProCommercialPartyContext & {
  amount?: string | null;
  paymentDescriptor?: string | null;
  scopeDescription?: string | null;
  terminationNotice?: string | null;
  governingLaw?: string | null;
  noticesMethod?: string | null;
  supportDescription?: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function resolveCommercialParties(context: ProCommercialPartyContext = {}) {
  const client = clean(context.clientRoleLabel) || "Client";
  const provider = clean(context.serviceProviderRoleLabel) || "Service Provider";
  const clientName = clean(context.clientLegalName);
  const providerName = clean(context.serviceProviderLegalName);
  const parties = clean(context.partiesLabel) || "Parties";
  return { client, provider, clientName, providerName, parties };
}

export function renderIntroClause(context: ProCommercialPartyContext = {}): string {
  const { client, provider, clientName, providerName } = resolveCommercialParties(context);
  if (clientName && providerName) {
    return `This Agreement is between ${clientName} ("${client}") and ${providerName} ("${provider}").`;
  }
  return `This Agreement is between ${client} and ${provider}.`;
}

function normalizeAmount(amount: string | null | undefined): string {
  const value = clean(amount).replace(/\s+total\s+project\s+fee\b/i, "");
  return value || "the fees stated in this Agreement";
}

export function renderPaymentSection(context: ProCommercialProseContext = {}): string {
  const { client, provider } = resolveCommercialParties(context);
  const amount = normalizeAmount(context.amount);
  const descriptor = clean(context.paymentDescriptor);
  if (/month/i.test(amount)) {
    return `${client} will pay ${provider} ${amount}${descriptor ? ` ${descriptor}` : ""}.`;
  }
  if (/milestone|phase|allocation|one-third|evenly|build-heavy/i.test(descriptor)) {
    return `${client} will pay ${provider} ${amount}, with payment allocated ${descriptor}.`;
  }
  return `${client} will pay ${provider} a total project fee of ${amount} for the services described in this Agreement.`;
}

export function renderOwnershipSection(context: ProCommercialProseContext = {}): string {
  const { client, provider } = resolveCommercialParties(context);
  return `${client} will own the deliverables created specifically for ${client} under this Agreement once ${client} has paid all amounts due for those deliverables. ${provider} retains its pre-existing tools, templates, know-how, methods, and background materials.`;
}

export function renderSupportSection(context: ProCommercialProseContext = {}): string {
  const { provider } = resolveCommercialParties(context);
  const support = clean(context.supportDescription);
  if (support) return `${provider} will provide ${support}.`;
  return `${provider} will provide commercially reasonable support for the services described in this Agreement.`;
}

export function renderTerminationSection(context: ProCommercialProseContext = {}): string {
  const { parties } = resolveCommercialParties(context);
  const notice = clean(context.terminationNotice) || "30 days written notice";
  return `Either ${parties === "Parties" ? "Party" : "party"} may terminate this Agreement by giving ${notice}.`;
}

export function renderNoticesSection(context: ProCommercialProseContext = {}): string {
  const { parties } = resolveCommercialParties(context);
  const method = clean(context.noticesMethod) || "email or another written method the parties have designated";
  return `${parties} may deliver notices by ${method}.`;
}

export function renderESignatureSection(context: ProCommercialProseContext = {}): string {
  const { parties } = resolveCommercialParties(context);
  return `${parties} may sign this Agreement electronically and in counterparts, and those signatures will have the same effect as original signatures.`;
}

