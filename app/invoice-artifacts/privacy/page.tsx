import {redirect} from "next/navigation";

/** The hackathon has one invoice-analysis path, without a ZDR preflight UI. */
export default function LegacyInvoicePrivacyPage(){
  redirect("/invoice-artifacts");
}
