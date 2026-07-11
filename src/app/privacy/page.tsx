import type { Metadata } from "next";
import { LegalShell, Section, P, UL, LI, Strong } from "@/components/legal/LegalShell";
import { LEGAL } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: `Privacy Policy — ${LEGAL.product}`,
  description: `How ${LEGAL.product} collects, uses, and protects personal information.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated={LEGAL.effectiveDate}>
      <Section id="intro" title="Introduction">
        <P>
          This Privacy Policy explains how {LEGAL.company} (&ldquo;{LEGAL.product},&rdquo;
          &ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses, shares, and protects personal
          information in connection with the {LEGAL.product} websites, applications, and services
          (the &ldquo;Service&rdquo;).
        </P>
      </Section>

      <Section id="roles" title="1. Our role: controller vs. processor">
        <UL>
          <LI>
            <Strong>For Operator account data</Strong> (the businesses that use {LEGAL.product}), we
            act as a <Strong>controller</Strong> — we decide how that data is used to provide the
            Service.
          </LI>
          <LI>
            <Strong>For Renter data an Operator collects through the Service</Strong> (their
            customers&rsquo; names, contact details, and booking information), the Operator is the
            controller and we act as a <Strong>processor</Strong> handling that data on the
            Operator&rsquo;s behalf. If you are a Renter, please also contact the Operator you booked
            with regarding your data.
          </LI>
        </UL>
      </Section>

      <Section id="collect" title="2. Information we collect">
        <UL>
          <LI>
            <Strong>Account &amp; business information:</Strong> name, email, phone, business name,
            location/service area, timezone, and settings you configure.
          </LI>
          <LI>
            <Strong>Renter &amp; booking information</Strong> (entered by Operators or submitted
            through a storefront): customer name, email, phone, delivery address, event dates, items,
            quotes, messages, and agreement status.
          </LI>
          <LI>
            <Strong>Payment information:</Strong> processed by Stripe. We receive limited details
            such as payment status, amounts, and card brand/last four — <Strong>not</Strong> full
            card numbers.
          </LI>
          <LI>
            <Strong>Communications:</Strong> messages you exchange through the Service&rsquo;s chat,
            email, and SMS features, and inquiries you send us.
          </LI>
          <LI>
            <Strong>Usage &amp; device data:</Strong> log data such as IP address, browser/device
            type, pages viewed, and timestamps, collected to operate, secure, and improve the
            Service (including rate limiting and abuse prevention).
          </LI>
          <LI>
            <Strong>Cookies:</Strong> essential cookies needed to sign in and keep you logged in (see
            &ldquo;Cookies&rdquo; below).
          </LI>
        </UL>
      </Section>

      <Section id="use" title="3. How we use information">
        <UL>
          <LI>To provide, maintain, and secure the Service and your account.</LI>
          <LI>To process bookings, payments, agreements, and communications you initiate.</LI>
          <LI>
            To generate AI-assisted quotes, replies, and suggestions that you review before use.
          </LI>
          <LI>To prevent fraud and abuse, enforce our Terms, and comply with legal obligations.</LI>
          <LI>To send service-related notices, and — where permitted — product updates.</LI>
          <LI>To analyze and improve the Service.</LI>
        </UL>
      </Section>

      <Section id="bases" title="4. Legal bases (where applicable)">
        <P>
          Where the GDPR or similar laws apply, we rely on: <Strong>performance of a contract</Strong>{" "}
          (to provide the Service you request); <Strong>legitimate interests</Strong> (to secure and
          improve the Service and prevent abuse); <Strong>consent</Strong> (where required, e.g. for
          certain communications); and <Strong>legal obligation</Strong> (to comply with the law).
        </P>
      </Section>

      <Section id="share" title="5. How we share information">
        <P>
          We do not sell personal information. We share it with service providers who process it on
          our behalf under contract, and only as needed to run the Service:
        </P>
        <UL>
          <LI>
            <Strong>Stripe</Strong> — payment processing and Operator payouts.
          </LI>
          <LI>
            <Strong>SignWell</Strong> — electronic signature of rental agreements.
          </LI>
          <LI>
            <Strong>Resend</Strong> — transactional email delivery.
          </LI>
          <LI>
            <Strong>Twilio</Strong> — SMS messaging (where enabled by the Operator).
          </LI>
          <LI>
            <Strong>Supabase</Strong> — database, authentication, and file storage hosting.
          </LI>
          <LI>
            <Strong>Vercel</Strong> — application hosting and delivery.
          </LI>
          <LI>
            <Strong>Upstash</Strong> — rate limiting / abuse prevention.
          </LI>
          <LI>
            <Strong>Anthropic</Strong> — AI model provider for quote-assistant features. Content sent
            for these features is processed to generate responses.
          </LI>
          <LI>
            <Strong>U.S. Census Geocoder</Strong> — converting addresses to coordinates for
            distance-based delivery pricing.
          </LI>
        </UL>
        <P>
          We may also share information between an Operator and its Renter to complete a booking; to
          comply with law, legal process, or enforceable requests; to protect rights, safety, and
          the integrity of the Service; and in connection with a merger, acquisition, or sale of
          assets (with notice where required).
        </P>
      </Section>

      <Section id="cookies" title="6. Cookies">
        <P>
          We use <Strong>essential cookies</Strong> only — for example, to authenticate you and keep
          you signed in. These are necessary for the Service to function and do not require consent
          under most laws. We do not currently use advertising or third-party analytics cookies. If
          that changes, we will update this policy and provide any consent controls the law requires.
        </P>
      </Section>

      <Section id="retention" title="7. Data retention">
        <P>
          We retain personal information for as long as needed to provide the Service, comply with
          legal, tax, and accounting obligations, resolve disputes, and enforce our agreements. When
          no longer needed, we delete or de-identify it. Operators may delete records within the
          Service; residual copies may persist in backups for a limited period.
        </P>
      </Section>

      <Section id="security" title="8. Security">
        <P>
          We use technical and organizational measures — including encryption in transit, access
          controls, and scoped credentials — to protect personal information. No method of
          transmission or storage is completely secure, and we cannot guarantee absolute security.
        </P>
      </Section>

      <Section id="rights" title="9. Your rights &amp; choices">
        <P>
          Depending on where you live, you may have rights to access, correct, delete, or receive a
          copy of your personal information, to object to or restrict certain processing, and to
          withdraw consent. California residents have rights under the CCPA/CPRA, including the right
          to know and delete and the right not to be discriminated against for exercising them; we do
          not sell or &ldquo;share&rdquo; personal information for cross-context behavioral
          advertising.
        </P>
        <P>
          To exercise a right, contact us at {LEGAL.contactEmail}. If your request concerns data an
          Operator controls (Renter data), we will refer you to, or act on the instructions of, that
          Operator. We may need to verify your identity before acting.
        </P>
      </Section>

      <Section id="transfers" title="10. International data transfers">
        <P>
          We and our providers may process information in the United States and other countries.
          Where required, we use appropriate safeguards for cross-border transfers.
        </P>
      </Section>

      <Section id="children" title="11. Children&rsquo;s privacy">
        <P>
          The Service is not directed to children under 13 (or the age required by local law), and we
          do not knowingly collect their personal information. If you believe a child provided us
          information, contact us and we will delete it.
        </P>
      </Section>

      <Section id="changes" title="12. Changes to this policy">
        <P>
          We may update this Privacy Policy from time to time. We will post the updated version with
          a new date and, for material changes, provide additional notice where required.
        </P>
      </Section>

      <Section id="contact" title="13. Contact">
        <P>
          For privacy questions or to exercise your rights, contact {LEGAL.company} at{" "}
          {LEGAL.contactEmail}
          {LEGAL.mailingAddress ? `, or ${LEGAL.mailingAddress}` : ""}.
        </P>
      </Section>
    </LegalShell>
  );
}
