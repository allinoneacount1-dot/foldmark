import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav } from "@/components/docs/DocShell";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Security & privacy",
  description: "What FOLDMARK can and cannot do with a wallet, what it never asks for, and how it treats public address data.",
};

export default function SecurityPage() {
  return (
    <article>
      <DocTitle
        kicker="SYSTEM"
        title="Security and privacy"
        lede="FOLDMARK is a read-only analytics surface. It never asks for a secret, never moves funds, and never attributes an address to a person."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="never" title="What FOLDMARK never requests">
          <List
            items={[
              "A seed phrase or recovery phrase — under any circumstance, on any screen.",
              "A private key.",
              "A password, an email or an account. There is no account system.",
              "A token approval or an allowance.",
              "A transaction signature. Nothing in the product produces one.",
            ]}
          />
          <Note tone="warn">
            If any page claiming to be FOLDMARK asks for a seed phrase, a private key or a signature, it is not
            FOLDMARK. There is no flow in this product that legitimately needs one.
          </Note>
        </DocSection>

        <DocSection id="wallet-scope" title="Wallet connection scope">
          <P>
            Connecting a wallet is entirely optional. Every analytical surface — assets, wallets, flows, topology, the
            API — works fully without it, because all of it is derived from public chain data.
          </P>
          <List
            items={[
              <>
                <strong className="text-ink">What connecting does</strong>: reads your address so the header can link to
                your own wallet page, and reads which chain your wallet is on so it can offer to switch to chain{" "}
                {CHAIN.id}.
              </>,
              <>
                <strong className="text-ink">What it does not do</strong>: request approvals, construct transactions,
                request signatures, or send anything anywhere.
              </>,
              <>
                <strong className="text-ink">Connector</strong>: the browser-injected EVM provider, via wagmi. FOLDMARK
                does not implement its own key handling.
              </>,
              <>
                <strong className="text-ink">Disconnecting</strong>: available at any time from the header. Nothing about
                the connection is persisted server-side.
              </>,
            ]}
          />
          <P>
            If a transaction capability is ever added, this page will document the exact approval, destination,
            allowance and signing flow before it ships. Until then there is nothing to disclose because nothing signs.
          </P>
        </DocSection>

        <DocSection id="no-audit" title="No security claims we have not earned">
          <P>
            FOLDMARK has <strong className="text-ink">not</strong> undergone a third-party security audit, and this page
            will not imply otherwise. The honest position is that the attack surface is small — read-only, no custody,
            no signing, no user accounts — not that it has been externally verified.
          </P>
          <List
            items={[
              "No smart contracts are deployed by this project. There is no on-chain code to audit.",
              "No user funds are held or routed at any point.",
              "No user accounts, sessions or passwords exist, so there is no credential store to breach.",
              "Server-side secrets are limited to a database service key and an optional cron secret. Neither is exposed to the browser.",
            ]}
          />
        </DocSection>

        <DocSection id="privacy" title="Privacy and address data">
          <P>
            Public blockchain addresses and their transactions are public data. FOLDMARK reads them, structures them and
            displays them. That is the entire basis of the product.
          </P>
          <P>
            What it deliberately does not do is <strong className="text-ink">attribute</strong>. FOLDMARK never infers a
            real-world identity for an address, and it will not add such an inference later. If labels are ever
            introduced they will come from an explicit, cited, trusted source, and the source will be shown next to the
            label.
          </P>
          <List
            items={[
              "No address is linked to a name, an entity or a person.",
              "Descriptions such as ACCUMULATING or NET SENDER describe observed movement in a window. They are not profiles and carry no claim about intent.",
              "The word 'wallet' means an address seen in a transfer. It does not imply a human owner.",
              "Wallet pages require no connection, so viewing one reveals nothing about the viewer to the address being viewed.",
            ]}
          />
          <Note>
            Creepy attribution is not a missing feature. Refusing to guess who an address belongs to is a design
            decision, and it holds even where guessing would be easy.
          </Note>
        </DocSection>

        <DocSection id="collection" title="What FOLDMARK collects">
          <List
            items={[
              "No account data, because there are no accounts.",
              "No wallet address is stored server-side when you connect; the connection lives in the browser.",
              "Addresses appear in the index only because they appeared in a public transfer log, never because someone visited the site.",
              "Standard hosting request logs apply, as with any website.",
            ]}
          />
        </DocSection>

        <DocSection id="reporting" title="Reporting a problem">
          <P>
            If you find a data-integrity problem — a figure that cannot be reproduced from the stated methodology, or a
            value shown where a state should be — that is a defect and it matters as much as a security issue. The
            methodology for every figure is published at{" "}
            <Link href="/docs/methodology" className="text-ink underline-offset-4 hover:underline">
              /docs/methodology
            </Link>{" "}
            precisely so it can be checked.
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/security" />
    </article>
  );
}
