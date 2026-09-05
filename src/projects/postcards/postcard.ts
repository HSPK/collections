import { escapeMarkup } from '../../core/page';
import { destinations } from './data';
import type { Destination } from './data';
import { landscapeMarkup } from './illustrations';

export function stopNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

function stampMarkup(destination: Destination): string {
  return `
    <div class="pp-stamp" aria-label="Fictional postage, ${escapeMarkup(destination.postalCode)}">
      <span class="pp-stamp-label">ELSEWHERE</span>
      <svg viewBox="0 0 70 48" width="70" height="48" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round">
        <circle cx="35" cy="17" r="9" stroke-width="1.8"/>
        <path d="M35 3V0m14 8 3-3m-34 3-3-3M8 32q9-7 18 0t18 0 18 0M8 40q9-7 18 0t18 0 18 0" stroke-width="1.8"/>
      </svg>
      <span class="pp-stamp-code">${escapeMarkup(destination.postalCode)}</span>
      <span class="pp-stamp-small">IMAGINARY POST</span>
    </div>`;
}

export function frontMarkup(destination: Destination, index: number): string {
  return `
    <figure class="pp-front-figure">
      <div class="pp-picture">
        ${landscapeMarkup(destination.id)}
        <div class="pp-front-postage">${stampMarkup(destination)}</div>
        <span class="pp-print-edition">FIELD EDITION / ${stopNumber(index)}</span>
      </div>
      <figcaption class="pp-picture-caption">
        <div>
          <span class="pp-caption-kicker">Greetings from</span>
          <strong class="pp-destination-name">${escapeMarkup(destination.name)}</strong>
          <p>${escapeMarkup(destination.caption)}</p>
        </div>
        <span class="pp-caption-number" aria-hidden="true">${stopNumber(index)}<span>/${stopNumber(destinations.length - 1)}</span></span>
      </figcaption>
    </figure>`;
}

export function backMarkup(destination: Destination): string {
  return `
    <div class="pp-back-inner">
      <header class="pp-back-header">
        <p>POST CARD</p>
        <span>Space for a real thought.<br> Not for real postage.</span>
      </header>
      <div class="pp-back-layout">
        <div class="pp-letter-copy">
          <p class="pp-letter-date">${escapeMarkup(destination.name)}<br>${escapeMarkup(destination.date)}</p>
          <p class="pp-salutation">${escapeMarkup(destination.salutation)}</p>
          <div class="pp-letter-paragraphs">
            ${destination.paragraphs.map((paragraph) => `<p>${escapeMarkup(paragraph)}</p>`).join('')}
          </div>
          <p class="pp-signoff">${escapeMarkup(destination.signoff)}<br><span>${escapeMarkup(destination.sender)}</span></p>
        </div>
        <aside class="pp-letter-address" aria-label="Postcard address">
          ${stampMarkup(destination)}
          <div class="pp-address">
            <p class="pp-kicker">To a familiar address</p>
            <address>${destination.address.map((line) => escapeMarkup(line)).join('<br>')}</address>
            <p class="pp-margin-note">${escapeMarkup(destination.marginNote)}</p>
          </div>
        </aside>
      </div>
      <footer class="pp-letter-enclosure">
        <span>Enclosed, in imagination</span>
        <p>${escapeMarkup(destination.enclosure)}</p>
      </footer>
    </div>`;
}

export function letterText(destination: Destination): string {
  return [
    'LETTERS FROM ELSEWHERE',
    'An imagined atlas. Fictional places, people, and correspondence.',
    '',
    destination.title,
    `From ${destination.name} / ${destination.region}`,
    destination.date,
    '',
    destination.salutation,
    '',
    ...destination.paragraphs.flatMap((paragraph) => [paragraph, '']),
    destination.signoff,
    destination.sender,
    '',
    'Addressed to:',
    ...destination.address,
    '',
    `Enclosed, in imagination: ${destination.enclosure}`,
    `A note in the margin: ${destination.marginNote}`,
    '',
    'No real postage or delivery service. Just a letter worth keeping.',
    '',
  ].join('\n');
}

export function postcardDocument(destination: Destination, index: number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeMarkup(destination.name)} - Letters from Elsewhere</title>
  <meta name="description" content="An original illustrated postcard and fictional letter from ${escapeMarkup(destination.name)}.">
  <style>
    *{box-sizing:border-box}body{margin:0;background:#eee9dd;color:#1c4265;font:17px/1.7 Georgia,serif}
    main{max-width:900px;margin:0 auto;padding:36px 24px}h1{margin:0;font-size:29px;font-weight:normal}
    .pp-export-intro,.pp-export-note{font:13px/1.65 'Courier New',monospace}.pp-export-intro{margin:5px 0 25px}
    .pp-export-front,.pp-export-back{margin:0 0 32px;padding:10px;border:1px solid #82949e;background:#fff8e8}
    figure,p{margin:0}.pp-picture{position:relative}.pp-landscape{display:block;width:100%;height:auto}
    .pp-print-edition{position:absolute;bottom:14px;left:16px;padding:4px 8px;background:#fff2d8;color:#244b6a;font:12px/1.5 'Courier New',monospace}
    .pp-front-postage{position:absolute;right:18px;top:18px;transform:rotate(7deg)}
    .pp-stamp{display:flex;width:94px;min-height:126px;align-items:center;flex-direction:column;justify-content:center;gap:2px;padding:7px;color:#b24b3d;background:#f9efd7;border:2px dotted currentColor;outline:4px solid #f9efd7;font-family:'Courier New',monospace}
    .pp-stamp svg{display:block;width:58px;height:40px}.pp-stamp-label{font-size:12px;letter-spacing:.02em}.pp-stamp-code{font-size:13px;font-weight:bold}.pp-stamp-small{font:12px/1.3 Arial,sans-serif}
    .pp-picture-caption{display:flex;justify-content:space-between;gap:18px;padding:20px 20px 24px}
    .pp-caption-kicker{display:block;font-style:italic;font-size:17px}.pp-destination-name{display:block;font-weight:normal;font-size:clamp(25px,5vw,44px);line-height:1.25}
    .pp-picture-caption p{margin-top:6px;font-size:15px}.pp-caption-number{font:39px/1.4 'Courier New',monospace;color:#b65745;white-space:nowrap}.pp-caption-number span{font-size:13px}
    .pp-back-inner{padding:25px}.pp-back-header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #9babb0;padding-bottom:20px;margin-bottom:25px}
    .pp-back-header p{font:24px/1.5 'Courier New',monospace;letter-spacing:.15em}.pp-back-header span{font:12px/1.5 'Courier New',monospace}
    .pp-back-layout{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:28px}.pp-letter-date{font:13px/1.6 'Courier New',monospace;margin-bottom:24px}
    .pp-letter-copy p{margin-bottom:19px}.pp-letter-copy .pp-salutation{font-size:21px}.pp-signoff span{display:inline-block;margin-top:7px;font-size:28px;font-style:italic}
    .pp-letter-address{border-left:1px solid #b2bebd;padding-left:23px}.pp-letter-address .pp-stamp{margin:3px 0 32px auto}
    .pp-kicker{font:12px/1.6 'Courier New',monospace;text-transform:uppercase;letter-spacing:.06em}address{margin-top:14px;font-style:normal;line-height:2.2;font-size:16px}
    .pp-margin-note{margin-top:28px;font-size:15px;font-style:italic}.pp-letter-enclosure{border-top:1px solid #b2bebd;padding-top:18px;margin-top:18px}
    .pp-letter-enclosure span{font:12px/1.6 'Courier New',monospace;text-transform:uppercase}.pp-letter-enclosure p{margin-top:5px;font-size:15px}
    .pp-export-title{font-size:25px;font-weight:normal;margin:0 0 24px}.pp-export-note{padding:0 0 12px}
    @media(max-width:600px){main{padding:20px 12px}.pp-back-inner{padding:14px}.pp-back-layout{display:block}.pp-letter-address{border-left:0;border-top:1px solid #b2bebd;padding:24px 0 0;margin-top:20px}.pp-letter-address .pp-stamp{float:right;margin-left:18px}.pp-letter-address:after{display:block;content:'';clear:both}.pp-front-postage .pp-stamp{width:64px;min-height:0;padding:4px}.pp-front-postage .pp-stamp svg{width:43px;height:30px}.pp-front-postage .pp-stamp-label,.pp-front-postage .pp-stamp-small,.pp-print-edition{display:none}.pp-picture-caption{padding:16px 10px}.pp-caption-number{font-size:24px}.pp-back-header{display:block}.pp-back-header span{display:block;margin-top:8px}}
    @media print{body{background:white}main{padding:0;max-width:none}.pp-export-front{break-after:page}.pp-export-front,.pp-export-back{border-color:#82949e;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pp-letter-copy p{orphans:3;widows:3}.pp-export-note{font-size:11px}}
  </style>
</head>
<body>
  <main>
    <h1>Letters from Elsewhere</h1>
    <p class="pp-export-intro">AN IMAGINED ATLAS / POSTCARD ${stopNumber(index)} OF ${stopNumber(destinations.length - 1)}</p>
    <article class="pp-export-front" aria-label="Picture side">${frontMarkup(destination, index)}</article>
    <h2 class="pp-export-title">${escapeMarkup(destination.title)}</h2>
    <article class="pp-export-back" aria-label="Letter side">${backMarkup(destination)}</article>
    <p class="pp-export-note">These places, people, stamps, and letters are fictional. This file includes both sides of the postcard, works offline, and can be printed. It contains no scripts, remote assets, or mail service.</p>
  </main>
</body>
</html>`;
}
