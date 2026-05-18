export type HomeExamplePrompt = {
  key: string;
  label: string;
  text: string;
};

export const HOME_EXAMPLE_PROMPTS: readonly HomeExamplePrompt[] = [
  {
    key: "services_agreement",
    label: "Services agreement",
    text: "Services agreement between Acme LLC and Northwind for website design. $8,500 flat fee, 50% deposit, work starts on signing, California law.",
  },
  {
    key: "simple_nda",
    label: "Simple NDA",
    text: "Mutual NDA between two companies sharing product plans for 2 years. Standard confidentiality, return or destroy materials, Delaware law.",
  },
  {
    key: "contractor_agreement",
    label: "Contractor agreement",
    text: "Independent contractor agreement: developer builds a mobile app for $120/hour, up to 80 hours/month, IP assigned on payment, 30-day termination notice.",
  },
] as const;

export function logHomeExampleSelected(exampleKey: string, inputLenAfter: number): void {
  console.info("[home-example-selected]", { exampleKey, inputLenAfter });
}
