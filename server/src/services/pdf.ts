import PDFDocument from 'pdfkit';
import { Response } from 'express';

type Pack = {
  member: { id: string; name: string; dob?: string };
  consent: { scope: string; collectedAt: string };
  screening: { domain: string; instrument: string; responses: any; note?: string; createdAt: string };
  referralTimeline: { orgName: string; service: string; status: string; occurredAt: string; result?: string; note?: string }[];
  zcodes: { code: string; label: string; rationale?: string; reviewer?: string; decidedAt?: string }[];
  packId: string;
  tenant: string;
};

export function streamEvidencePDF(res: Response, pack: Pack) {
  const doc = new PDFDocument({ margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  doc.fontSize(18).text('SDOH Evidence Pack', { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Tenant: ${pack.tenant}`);
  doc.text(`Pack ID: ${pack.packId}`);
  doc.moveDown();

  doc.fontSize(14).text('Member');
  doc.fontSize(12).text(`ID: ${pack.member.id}`);
  doc.text(`Name: ${pack.member.name}`);
  if (pack.member.dob) doc.text(`DOB: ${pack.member.dob}`);
  doc.moveDown();

  doc.fontSize(14).text('Consent');
  doc.fontSize(12).text(`Scope: ${pack.consent.scope}`);
  doc.text(`Collected: ${pack.consent.collectedAt}`);
  doc.moveDown();

  doc.fontSize(14).text('Screening');
  doc.fontSize(12).text(`Domain: ${pack.screening.domain}`);
  doc.text(`Instrument: ${pack.screening.instrument}`);
  doc.text(`Responses: ${JSON.stringify(pack.screening.responses)}`);
  if (pack.screening.note) doc.text(`Note: ${pack.screening.note}`);
  doc.text(`Created: ${pack.screening.createdAt}`);
  doc.moveDown();

  doc.fontSize(14).text('Referral Timeline');
  pack.referralTimeline.forEach((e, i) => {
    doc.fontSize(12).text(`${i+1}. ${e.occurredAt} — ${e.orgName} (${e.service}) [${e.status}] ${e.result ? '→ '+e.result : ''}`);
    if (e.note) doc.text(`   Note: ${e.note}`);
  });
  doc.moveDown();

  doc.fontSize(14).text('Final Z-Codes');
  pack.zcodes.forEach(z => {
    doc.fontSize(12).text(`${z.code} — ${z.label}`);
    if (z.rationale) doc.text(`Rationale: ${z.rationale}`);
    if (z.reviewer) doc.text(`Reviewed by: ${z.reviewer} ${z.decidedAt ? 'at '+z.decidedAt : ''}`);
  });

  doc.end();
}
