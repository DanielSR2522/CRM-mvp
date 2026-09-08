import { EmailBlock } from '@/types/marketing';

/**
 * Compiles a list of visual EmailBlocks into responsive, inline-styled email-safe HTML
 * compatible with Outlook, Gmail, Apple Mail, and mobile clients.
 */
export interface GlobalEmailStyles {
  canvasBg?: string;
  contentBg?: string;
  maxWidth?: string;
  bodyFont?: string;
  bodyColor?: string;
  linkColor?: string;
  outerPadding?: string;
  borderRadius?: string;
}

/**
 * Compiles a list of visual EmailBlocks into responsive, inline-styled email-safe HTML
 * compatible with Outlook, Gmail, Apple Mail, and mobile clients.
 */
export function compileBlocksToEmailHtml(
  blocks: EmailBlock[],
  globalStyles?: GlobalEmailStyles
): string {
  if (!blocks || blocks.length === 0) {
    return '<div style="padding: 20px; text-align: center; color: #64748b; font-family: sans-serif;">Empty Email Body</div>';
  }

  const canvasBg = globalStyles?.canvasBg || '#f8fafc';
  const contentBg = globalStyles?.contentBg || '#ffffff';
  const maxWidth = globalStyles?.maxWidth || '600px';
  const bodyFont = globalStyles?.bodyFont || 'Arial, Helvetica, sans-serif';
  const linkColor = globalStyles?.linkColor || '#2563eb';
  const outerPadding = globalStyles?.outerPadding || '20px';
  const borderRadius = globalStyles?.borderRadius || '16px';

  const compiledBlocksHtml = blocks.map((b) => compileSingleBlock(b, globalStyles)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marketing Email</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${canvasBg}; font-family: ${bodyFont}; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; max-width: 100%; height: auto; }
    a { color: ${linkColor}; text-decoration: none; }
  </style>
</head>
<body style="margin:0; padding:${outerPadding}; background-color:${canvasBg}; font-family:${bodyFont};">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:${canvasBg};">
    <tr>
      <td align="center">
        <table role="presentation" width="${maxWidth.replace('px','')}" border="0" cellspacing="0" cellpadding="0" style="width:${maxWidth}; max-width:${maxWidth}; background-color:${contentBg}; border-radius:${borderRadius}; border:1px solid #e2e8f0; overflow:hidden;">
          <tr>
            <td style="padding:24px;">
              ${compiledBlocksHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function compileSingleBlock(block: EmailBlock, globalStyles?: GlobalEmailStyles): string {
  const padTop = block.paddingTop ?? 12;
  const padBottom = block.paddingBottom ?? 12;
  const align = block.align || 'left';
  const bgColor = block.bgColor ? `background-color: ${block.bgColor};` : '';
  const textColor = block.textColor ? `color: ${block.textColor};` : 'color: #0f172a;';
  const fontSize = block.fontSize ? `font-size: ${block.fontSize};` : 'font-size: 14px;';
  const borderRadius = block.borderRadius ? `border-radius: ${block.borderRadius};` : '';

  const wrapperStyle = `padding-top:${padTop}px; padding-bottom:${padBottom}px; text-align:${align}; ${bgColor} ${borderRadius}`;

  switch (block.type) {
    case 'heading': {
      const level = block.headingLevel || 'h2';
      const headingSize = level === 'h1' ? '24px' : level === 'h2' ? '20px' : '16px';
      return `<div style="${wrapperStyle}">
  <h2 style="margin:0; font-family:Arial, sans-serif; font-size:${headingSize}; font-weight:bold; ${textColor} line-height:1.3;">
    ${block.headingText || 'Heading Text'}
  </h2>
</div>`;
    }

    case 'text': {
      return `<div style="${wrapperStyle}">
  <div style="font-family:Arial, sans-serif; ${fontSize} ${textColor} line-height:1.6;">
    ${(block.text || 'Paragraph text content goes here.').replace(/\n/g, '<br/>')}
  </div>
</div>`;
    }

    case 'image': {
      const imgWidth = block.imageWidth || '100%';
      const imgAlign = block.imageAlign || 'center';
      return `<div style="${wrapperStyle} text-align:${imgAlign};">
  <img src="${block.imageUrl || 'https://via.placeholder.com/600x200?text=Banner+Image'}" alt="${block.imageAlt || 'Image'}" style="width:${imgWidth}; max-width:100%; height:auto; border-radius:12px; display:inline-block;" />
</div>`;
    }

    case 'button': {
      const btnBg = block.buttonBgColor || '#2563eb';
      const btnTextClr = block.buttonTextColor || '#ffffff';
      const btnAlign = block.buttonAlign || 'center';
      const btnRadius = block.buttonRadius || '10px';
      return `<div style="${wrapperStyle} text-align:${btnAlign};">
  <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="display:inline-block;">
    <tr>
      <td align="center" style="background-color:${btnBg}; border-radius:${btnRadius}; padding:12px 24px;">
        <a href="${block.buttonUrl || '#'}" target="_blank" style="font-family:Arial, sans-serif; font-size:14px; font-weight:bold; color:${btnTextClr}; text-decoration:none; display:inline-block;">
          ${block.buttonText || 'Click Here'}
        </a>
      </td>
    </tr>
  </table>
</div>`;
    }

    case 'columns': {
      return `<div style="${wrapperStyle}">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td width="48%" text-align="left" style="vertical-align:top; background-color:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0;">
        <div style="font-family:Arial, sans-serif; font-size:13px; color:#334155; line-height:1.5;">
          ${(block.col1Text || 'Column 1 text area.').replace(/\n/g, '<br/>')}
        </div>
        ${
          block.col1ButtonText
            ? `<div style="margin-top:12px;"><a href="${block.col1ButtonUrl || '#'}" style="display:inline-block; padding:8px 16px; background-color:#2563eb; color:#ffffff; font-size:12px; font-weight:bold; border-radius:8px; text-decoration:none;">${block.col1ButtonText}</a></div>`
            : ''
        }
      </td>
      <td width="4%"></td>
      <td width="48%" text-align="left" style="vertical-align:top; background-color:#f8fafc; padding:16px; border-radius:12px; border:1px solid #e2e8f0;">
        <div style="font-family:Arial, sans-serif; font-size:13px; color:#334155; line-height:1.5;">
          ${(block.col2Text || 'Column 2 text area.').replace(/\n/g, '<br/>')}
        </div>
        ${
          block.col2ButtonText
            ? `<div style="margin-top:12px;"><a href="${block.col2ButtonUrl || '#'}" style="display:inline-block; padding:8px 16px; background-color:#2563eb; color:#ffffff; font-size:12px; font-weight:bold; border-radius:8px; text-decoration:none;">${block.col2ButtonText}</a></div>`
            : ''
        }
      </td>
    </tr>
  </table>
</div>`;
    }

    case 'divider': {
      const lineColor = block.lineColor || '#e2e8f0';
      const thickness = block.lineThickness || '1px';
      return `<div style="${wrapperStyle}">
  <hr style="border:0; border-top:${thickness} solid ${lineColor}; margin:0;" />
</div>`;
    }

    case 'spacer': {
      const height = block.spaceHeight || '24px';
      return `<div style="height:${height}; line-height:${height}; font-size:1px;">&nbsp;</div>`;
    }

    case 'social': {
      const platforms = block.socialPlatforms || [
        { platform: 'Facebook', url: '#', icon: '🌐' },
        { platform: 'LinkedIn', url: '#', icon: '💼' },
        { platform: 'WhatsApp', url: '#', icon: '💬' },
      ];
      const linksHtml = platforms
        .map(
          (p) =>
            `<a href="${p.url}" target="_blank" style="display:inline-block; margin:0 8px; font-family:Arial, sans-serif; font-size:12px; color:#2563eb; font-weight:bold; text-decoration:none;">${p.icon} ${p.platform}</a>`
        )
        .join('');
      return `<div style="${wrapperStyle} text-align:center;">
  ${linksHtml}
</div>`;
    }

    case 'menu': {
      const links = block.menuLinks || [
        { label: 'Coverage Options', url: '#' },
        { label: 'Carrier Portal', url: '#' },
        { label: 'Contact Agent', url: '#' },
      ];
      const menuHtml = links
        .map(
          (m) =>
            `<a href="${m.url}" target="_blank" style="display:inline-block; margin:0 12px; font-family:Arial, sans-serif; font-size:13px; font-weight:bold; color:#0f172a; text-decoration:none;">${m.label}</a>`
        )
        .join(' &bull; ');
      return `<div style="${wrapperStyle} text-align:center; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; padding-top:12px; padding-bottom:12px;">
  ${menuHtml}
</div>`;
    }

    case 'logo': {
      return `<div style="${wrapperStyle}">
  <div style="font-family:Arial, sans-serif; font-size:20px; font-weight:bold; color:#1e3a8a; tracking-tight;">
    🛡️ SmarTrack CRM <span style="font-size:12px; color:#64748b; font-weight:normal;">| Insurance Portal</span>
  </div>
</div>`;
    }

    case 'hero': {
      return `<div style="padding-top:${padTop}px; padding-bottom:${padBottom}px;">
  <div style="background-color:#1e293b; border-radius:16px; padding:32px 24px; text-align:center; color:#ffffff;">
    <h1 style="margin:0 0 12px 0; font-family:Arial, sans-serif; font-size:26px; font-weight:bold; color:#ffffff;">
      ${block.headingText || 'Special Coverage Update'}
    </h1>
    <p style="margin:0 0 20px 0; font-family:Arial, sans-serif; font-size:14px; color:#cbd5e1; line-height:1.5;">
      ${(block.text || 'Important notice regarding your policy terms and renewal dates.').replace(/\n/g, '<br/>')}
    </p>
    ${
      block.buttonText
        ? `<a href="${block.buttonUrl || '#'}" style="display:inline-block; padding:12px 24px; background-color:#2563eb; color:#ffffff; font-size:14px; font-weight:bold; border-radius:10px; text-decoration:none;">${block.buttonText}</a>`
        : ''
    }
  </div>
</div>`;
    }

    case 'callout': {
      const calloutBg = block.calloutBgColor || '#eff6ff';
      return `<div style="${wrapperStyle}">
  <div style="background-color:${calloutBg}; border-left:4px solid #2563eb; border-radius:12px; padding:16px; font-family:Arial, sans-serif; font-size:13px; color:#1e3a8a; line-height:1.5;">
    <strong style="display:block; font-size:14px; margin-bottom:4px;">💡 ${block.calloutTitle || 'Important Notice'}</strong>
    ${(block.calloutText || 'Please review your open enrollment options before your renewal deadline.').replace(/\n/g, '<br/>')}
  </div>
</div>`;
    }

    case 'signature': {
      return `<div style="${wrapperStyle} border-top:1px solid #e2e8f0; padding-top:16px;">
  <div style="font-family:Arial, sans-serif; font-size:13px; color:#334155; line-height:1.6;">
    <strong>${block.agentName || '{{agent_name}}'}</strong><br/>
    <span style="color:#64748b; font-size:12px;">${block.agentTitle || 'Licensed Health & Life Agent'}</span><br/>
    📧 ${block.agentEmail || 'agent@smartrack.com'} &bull; 📞 ${block.agentPhone || '(800) 555-0199'}
  </div>
</div>`;
    }

    case 'cta': {
      return `<div style="${wrapperStyle}">
  <div style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:16px; padding:24px; text-align:center;">
    <h3 style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:18px; font-weight:bold; color:#166534;">
      ${block.headingText || 'Ready to Complete Your Renewal?'}
    </h3>
    <p style="margin:0 0 16px 0; font-family:Arial, sans-serif; font-size:13px; color:#15803d;">
      ${block.text || 'Our licensed agents are standing by to lock in your rates.'}
    </p>
    <a href="${block.buttonUrl || '#'}" style="display:inline-block; padding:12px 24px; background-color:#16a34a; color:#ffffff; font-size:14px; font-weight:bold; border-radius:10px; text-decoration:none;">
      ${block.buttonText || 'Renew Policy Now'}
    </a>
  </div>
</div>`;
    }

    case 'testimonial': {
      return `<div style="${wrapperStyle}">
  <blockquote style="margin:0; background-color:#f8fafc; border-left:4px solid #94a3b8; border-radius:8px; padding:16px; font-style:italic; font-family:Arial, sans-serif; font-size:13px; color:#475569; line-height:1.6;">
    "${block.quoteText || 'SmarTrack CRM made my health plan renewal effortless and saved my family money!'}"
    <footer style="margin-top:8px; font-style:normal; font-weight:bold; color:#0f172a; font-size:12px;">
      &mdash; ${block.quoteAuthor || 'Satisfied Client'}
    </footer>
  </blockquote>
</div>`;
    }

    case 'footer': {
      return `<div style="${wrapperStyle} border-top:1px solid #e2e8f0; padding-top:20px; text-align:center; font-family:Arial, sans-serif; font-size:11px; color:#64748b; line-height:1.6;">
  <div>${block.footerCompany || 'SmarTrack CRM &bull; Invernalia Insurance Agency'}</div>
  <div>${block.footerAddress || '100 SE 2nd St, Miami, FL 33131'}</div>
  <div style="margin-top:12px;">
    To stop receiving marketing emails, <a href="{{unsubscribe_url}}" style="color:#2563eb; text-decoration:underline;">click here to unsubscribe</a>.
  </div>
</div>`;
    }

    case 'html': {
      return `<div style="${wrapperStyle}">
  ${block.htmlContent || '<div>Raw HTML Content</div>'}
</div>`;
    }

    default:
      return `<div style="${wrapperStyle}">${block.text || ''}</div>`;
  }
}
