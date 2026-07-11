import type { Metadata } from "next";
import { LegalShell, Section, P, UL, LI, Strong } from "@/components/legal/LegalShell";
import { LEGAL } from "@/lib/legal/company";

export const metadata: Metadata = {
  title: `Terms of Service — ${LEGAL.product}`,
  description: `The terms governing use of the ${LEGAL.product} platform.`,
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated={LEGAL.effectiveDate}>
      <Section id="intro" title="Introduction">
        <P>
          These Terms of Service (the &ldquo;Terms&rdquo;) are a binding agreement between you and{" "}
          {LEGAL.company} (&ldquo;{LEGAL.product},&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) and govern your access to and use of the {LEGAL.product} websites,
          applications, and services (together, the &ldquo;Service&rdquo;). Please read them
          carefully.
        </P>
        <P>
          <Strong>By creating an account, or by accessing or using the Service, you agree to
          these Terms.</Strong> If you do not agree, do not use the Service. If you are using the
          Service on behalf of a business, you represent that you are authorized to bind that
          business to these Terms.
        </P>
      </Section>

      <Section id="service" title="1. The Service">
        <P>
          {LEGAL.product} provides software that helps party- and event-rental businesses
          (&ldquo;Operators&rdquo;) manage inventory, availability, quotes, bookings, payments,
          agreements, and customer communication, and provides a hosted storefront where an
          Operator&rsquo;s customers (&ldquo;Renters&rdquo;) can request quotes and place bookings.
        </P>
        <P>
          We may add, change, or remove features at any time. We may also set or change limits on
          the Service (for example, storage, item counts, or AI-assisted quotes) by plan.
        </P>
      </Section>

      <Section id="eligibility" title="2. Eligibility &amp; accounts">
        <UL>
          <LI>You must be at least 18 years old and able to form a binding contract.</LI>
          <LI>
            You are responsible for the accuracy of the information you provide and for all activity
            under your account.
          </LI>
          <LI>
            <Strong>Keep your credentials secure.</Strong> Notify us promptly at{" "}
            {LEGAL.contactEmail} if you suspect unauthorized access. You are responsible for
            maintaining the confidentiality of your login.
          </LI>
        </UL>
      </Section>

      <Section id="marketplace" title="3. Operators, Renters &amp; our role">
        <P>
          {LEGAL.product} is a technology provider, <Strong>not a party</Strong> to the rental
          transaction between an Operator and a Renter. The Operator alone is responsible for its
          listings, pricing, availability, taxes, rental agreements, equipment safety, delivery,
          setup, insurance, refunds, and compliance with applicable laws.
        </P>
        <UL>
          <LI>
            <Strong>If you are an Operator:</Strong> you are the merchant of record for your
            bookings. Your own rental terms, waivers, and policies govern your relationship with your
            Renters. You are responsible for honoring the bookings you accept.
          </LI>
          <LI>
            <Strong>If you are a Renter:</Strong> your booking is with the Operator, and the
            Operator&rsquo;s own terms and rental agreement apply to it. Questions about a specific
            booking, refund, or item should go to the Operator.
          </LI>
        </UL>
        <P>
          We do not guarantee the quality, safety, legality, or availability of any Operator&rsquo;s
          items or services, nor any Renter&rsquo;s conduct.
        </P>
      </Section>

      <Section id="billing" title="4. Subscriptions, trials &amp; billing">
        <UL>
          <LI>
            Paid plans are billed in advance on a recurring basis through our payment processor.
            Where a free trial is offered, your paid subscription begins automatically when the trial
            ends unless you cancel before then.
          </LI>
          <LI>
            <Strong>Cancellation:</Strong> you may cancel at any time; cancellation takes effect at
            the end of the current billing period. Except where required by law, fees already paid
            are non-refundable.
          </LI>
          <LI>
            We may change plan pricing or features on prospective notice. If a change materially
            disadvantages you, you may cancel before it takes effect.
          </LI>
          <LI>
            Failed payments may result in downgrade or suspension. Taxes, where applicable, are your
            responsibility.
          </LI>
        </UL>
      </Section>

      <Section id="payments" title="5. Payment processing">
        <P>
          Payments between Renters and Operators, and subscription payments, are processed by{" "}
          <Strong>Stripe</Strong>. By using the Service you also agree to Stripe&rsquo;s applicable
          terms, including the Stripe Connected Account Agreement where you onboard as an Operator.
          {LEGAL.product} does not store full payment card numbers.
        </P>
        <P>
          Operators receive payouts through their connected Stripe account and are responsible for
          providing accurate payout and tax information. Platform fees, if any, are disclosed in the
          Service.
        </P>
      </Section>

      <Section id="acceptable-use" title="6. Acceptable use">
        <P>You agree not to:</P>
        <UL>
          <LI>Use the Service for anything unlawful, fraudulent, harmful, or deceptive.</LI>
          <LI>Infringe others&rsquo; intellectual property, privacy, or other rights.</LI>
          <LI>
            Upload malware, attempt to breach or probe the Service&rsquo;s security, or circumvent
            usage limits, authentication, or rate limits.
          </LI>
          <LI>
            Scrape, resell, or provide the Service to third parties except as expressly permitted.
          </LI>
          <LI>
            Send unlawful, harassing, or unsolicited communications, or use the Service&rsquo;s
            messaging/SMS features in violation of applicable communications laws (e.g., TCPA,
            CAN-SPAM, A2P registration requirements).
          </LI>
        </UL>
      </Section>

      <Section id="content" title="7. Your content &amp; data">
        <P>
          You retain ownership of the content and data you submit (&ldquo;Your Content&rdquo;),
          including inventory details, photos, customer records, and messages. You grant us a
          worldwide, non-exclusive license to host, process, and display Your Content solely to
          operate and improve the Service and as directed by you.
        </P>
        <P>
          You are responsible for having the rights and permissions needed for Your Content,
          including any personal information about your Renters. Your and our handling of personal
          information is described in our <Strong>Privacy Policy</Strong>.
        </P>
      </Section>

      <Section id="ip" title="8. Our intellectual property">
        <P>
          The Service, including its software, design, and trademarks, is owned by {LEGAL.company} or
          its licensors and is protected by law. We grant you a limited, revocable, non-transferable
          right to use the Service under these Terms. You may not copy, modify, reverse-engineer, or
          create derivative works except as permitted by law.
        </P>
      </Section>

      <Section id="third-party" title="9. Third-party services">
        <P>
          The Service integrates third-party providers (for example, payment, e-signature, email,
          SMS, hosting, and AI providers). Your use of those features may be subject to the third
          party&rsquo;s terms, and we are not responsible for third-party services. See the Privacy
          Policy for the providers we use.
        </P>
      </Section>

      <Section id="ai" title="10. AI-assisted features">
        <P>
          Some features use automated and AI systems to draft quotes, replies, and suggestions.
          These outputs may be inaccurate or incomplete. <Strong>You are responsible for reviewing
          them before relying on or sending them,</Strong> including prices, availability, and
          commitments made to Renters.
        </P>
      </Section>

      <Section id="disclaimers" title="11. Disclaimers">
        <P>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
          WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO
          NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
        </P>
      </Section>

      <Section id="liability" title="12. Limitation of liability">
        <P>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {LEGAL.company.toUpperCase()} WILL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
          PROFITS, REVENUE, DATA, OR GOODWILL. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE
          SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE
          TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS.
        </P>
      </Section>

      <Section id="indemnity" title="13. Indemnification">
        <P>
          You agree to indemnify and hold harmless {LEGAL.company} and its officers, employees, and
          agents from any claims, damages, and expenses (including reasonable legal fees) arising out
          of Your Content, your use of the Service, your rental transactions, or your breach of these
          Terms or applicable law.
        </P>
      </Section>

      <Section id="termination" title="14. Suspension &amp; termination">
        <P>
          You may stop using the Service at any time. We may suspend or terminate your access if you
          violate these Terms, create risk or legal exposure for us, or for prolonged inactivity or
          non-payment. On termination, your right to use the Service ends; sections that by their
          nature should survive (for example, ownership, disclaimers, liability limits, and
          indemnities) will survive.
        </P>
      </Section>

      <Section id="law" title="15. Governing law &amp; disputes">
        <P>
          These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to its
          conflict-of-laws rules. The courts located in {LEGAL.governingLaw} will have exclusive
          jurisdiction, unless applicable law requires otherwise. Nothing here limits any
          non-waivable rights you have under the law of your place of residence.
        </P>
      </Section>

      <Section id="changes" title="16. Changes to these Terms">
        <P>
          We may update these Terms from time to time. If we make material changes, we will take
          reasonable steps to notify you (for example, by posting the updated Terms with a new date
          or notifying you in the Service). Your continued use after the changes take effect
          constitutes acceptance.
        </P>
      </Section>

      <Section id="contact" title="17. Contact">
        <P>
          Questions about these Terms? Contact {LEGAL.company} at {LEGAL.contactEmail}
          {LEGAL.mailingAddress ? `, or ${LEGAL.mailingAddress}` : ""}.
        </P>
      </Section>
    </LegalShell>
  );
}
