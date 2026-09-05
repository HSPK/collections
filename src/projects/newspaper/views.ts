import { escapeMarkup } from '../../core/page';
import { edition, getSection, getStory, readingMinutes, sections, stories } from './data';
import type { NewspaperSection, Story } from './data';
import { renderIllustration } from './illustrations';
import type { NewspaperRoute } from './routes';

const e = escapeMarkup;
const articleHref = (story: Story): string => `#article/${encodeURIComponent(story.id)}`;
const sectionName = (story: Story): string => getSection(story.section)?.name ?? 'The edition';

function figure(story: Story, className = '', caption = story.caption): string {
  return `<figure class="nw-figure ${className}">
    ${renderIllustration(story.illustration, story.imageDescription)}
    <figcaption>${e(caption)}</figcaption>
  </figure>`;
}

function byline(story: Story): string {
  return `<p class="nw-byline"><span>By ${e(story.author)}</span><span>${readingMinutes(story)} min read</span></p>`;
}

function continueLink(story: Story, text = 'Read the story'): string {
  return `<a class="nw-read-link" href="${articleHref(story)}" aria-label="${e(text)}: ${e(story.title)}">${e(text)} <span aria-hidden="true">↗</span></a>`;
}

function headline(story: Story): string {
  return `<h3><a href="${articleHref(story)}">${e(story.title)}</a></h3>`;
}

export function renderShell(): string {
  return `
    <a class="nw-skip" href="#nw-content" data-skip>Skip to the stories</a>
    <div class="nw-fiction-bar">
      <strong><span class="nw-fiction-dot" aria-hidden="true"></span>Fictional future publication</strong>
      <span class="nw-fiction-explanation">An imagined world. Not actual news.</span>
    </div>
    <div class="nw-paper">
      <header class="nw-header">
        <div class="nw-dateline"><span>${e(edition.place)}</span><span>${e(edition.number)}</span><time datetime="${edition.isoDate}">${e(edition.date)}</time></div>
        <h1 class="nw-masthead"><a href="#front-page">Signals <em>from</em> 2086</a></h1>
        <div class="nw-motto"><span>Public life.</span><span>Small wonders.</span><span>Unfinished futures.</span></div>
        <div class="nw-navigation">
          <nav class="nw-sections" aria-label="Newspaper sections">
            <a href="#front-page" data-nav="front">Front page</a>
            ${sections.map((section) => `<a href="#section/${section.id}" data-nav="${section.id}">${e(section.name)}</a>`).join('')}
          </nav>
          <a class="nw-reading-list-link" href="#reading-list" data-nav="saved">Reading list <span class="nw-count" data-saved-count>0</span></a>
        </div>
        <div class="nw-reader-strip">
          <p>One imagined edition. <strong>Seven original stories.</strong></p>
          <button type="button" class="nw-type-button" data-toggle-size aria-pressed="false"><span aria-hidden="true">Aa</span> Larger type</button>
        </div>
      </header>
      <p class="nw-reader-status" role="status" aria-live="polite" aria-atomic="true" data-reader-status hidden></p>
      <div id="nw-content" class="nw-content" tabindex="-1" data-content></div>
      <footer class="nw-colophon">
        <div><a class="nw-footer-title" href="#front-page">Signals <em>from</em> 2086</a><p>A little further ahead.<br>A little closer to everyday life.</p></div>
        <p><strong>Fictional future publication.</strong> Port Meridian, its institutions, characters, and events are invented. This is original speculative fiction, not current news or a forecast.</p>
        <nav aria-label="Publication information"><a href="#about">About this edition <span aria-hidden="true">↗</span></a><a href="#reading-list">Your reading list <span aria-hidden="true">↗</span></a><a href="#front-page">Back to front page <span aria-hidden="true">↑</span></a></nav>
      </footer>
      <div class="nw-bottom-line"><span>Written for the possible, not the probable.</span><span>End of edition · 01</span></div>
    </div>`;
}

function renderFrontPage(): string {
  const [cloud, seeds, train, river, repair, shadow, opinion] = stories;
  return `
    <div class="nw-edition-heading"><h2 data-route-heading tabindex="-1">The front page</h2><p>${e(edition.theme)}</p><span>Edition 01</span></div>
    <div class="nw-front-grid" data-project-preview>
      <article class="nw-lead" data-story="${cloud.id}">
        <p class="nw-kicker"><a href="#section/city">${e(sectionName(cloud))}</a><span aria-hidden="true"> / </span>${e(cloud.kicker)}</p>
        ${headline(cloud)}
        <p class="nw-standfirst">${e(cloud.standfirst)}</p>
        ${figure(cloud, 'nw-lead-figure')}
        <div class="nw-lead-copy nw-reading-copy">${cloud.paragraphs.slice(0, 3).map((paragraph) => `<p>${e(paragraph)}</p>`).join('')}</div>
        ${byline(cloud)}
        ${continueLink(cloud, 'Follow the borrowed shade')}
      </article>
      <article class="nw-offworld-feature" data-story="${seeds.id}">
        <p class="nw-kicker"><a href="#section/off-world">Off-world</a><span aria-hidden="true"> / </span>Field notes</p>
        ${headline(seeds)}
        <p class="nw-feature-deck">${e(seeds.standfirst)}</p>
        ${figure(seeds, 'nw-spot-figure', 'At Faraday, even a failed harvest has a place in the catalogue.')}
        <p class="nw-reading-copy">${e(seeds.paragraphs[0])}</p>
        <p class="nw-reading-copy">${e(seeds.paragraphs[1])}</p>
        ${byline(seeds)}
        ${continueLink(seeds, 'Open the lunar letter')}
      </article>
      <aside class="nw-editorial-rail" aria-label="From the editorial desk">
        <article data-story="${opinion.id}">
          <p class="nw-kicker"><a href="#section/opinion">The editorial</a></p>
          ${figure(opinion, 'nw-editorial-figure', 'A little capacity for the unexpected.')}
          ${headline(opinion)}
          <p class="nw-reading-copy">${e(opinion.standfirst)}</p>
          <blockquote class="nw-front-quote"><p>“${e(opinion.pullQuote)}”</p></blockquote>
          ${continueLink(opinion, 'Read the argument')}
        </article>
        <div class="nw-desk-note">
          <p class="nw-kicker">A note from the desk</p>
          <p>Not every future arrives with a bang. Some arrive as a library receipt, an extra boarding minute, or a door left open for something small.</p>
          <p>This edition is about who gets to use the things we share.</p>
          <a class="nw-read-link" href="#about">Meet this imagined world <span aria-hidden="true">↗</span></a>
        </div>
      </aside>
    </div>
    <section class="nw-across-edition" aria-labelledby="nw-across-title">
      <div class="nw-section-rule"><h2 id="nw-across-title">Elsewhere in the everyday future</h2><span>Four more ways to look closer</span></div>
      <div class="nw-lower-grid">
        <article class="nw-transport-feature" data-story="${train.id}">
          <p class="nw-kicker"><a href="#section/city">City & commons</a><span aria-hidden="true"> / </span>Transport</p>
          ${figure(train, 'nw-lower-figure', 'The machinery is quieter. The people need not be.')}
          ${headline(train)}
          <p class="nw-feature-deck">${e(train.standfirst)}</p>
          <p class="nw-reading-copy">${e(train.paragraphs[0])}</p>
          ${byline(train)}
          ${continueLink(train, 'Board the 07:12')}
        </article>
        <article class="nw-river-feature" data-story="${river.id}">
          <p class="nw-kicker"><a href="#section/living">Living systems</a><span aria-hidden="true"> / </span>Passage</p>
          ${headline(river)}
          ${figure(river, 'nw-lower-figure', 'A migration route with a maintenance budget.')}
          <p class="nw-reading-copy">${e(river.paragraphs[0])}</p>
          ${byline(river)}
          ${continueLink(river, 'Follow the river door')}
        </article>
        <div class="nw-culture-column">
          <article class="nw-culture-brief" data-story="${repair.id}">
            <p class="nw-kicker"><a href="#section/culture">Culture</a><span aria-hidden="true"> / </span>Listening room</p>
            ${figure(repair, 'nw-culture-figure', 'An ensemble rescued from the scrap pile.')}
            ${headline(repair)}
            <p class="nw-reading-copy">${e(repair.standfirst)}</p>
            ${continueLink(repair, 'Visit the repair hall')}
          </article>
          <article class="nw-culture-brief" data-story="${shadow.id}">
            <p class="nw-kicker">An education in looking</p>
            ${headline(shadow)}
            <p class="nw-reading-copy">${e(shadow.standfirst)}</p>
            ${figure(shadow, 'nw-culture-figure', 'The last lesson takes place before sunset.')}
            ${continueLink(shadow, 'Join the rooftop class')}
          </article>
        </div>
      </div>
    </section>
    <aside class="nw-noticeboard" aria-label="From the fictional noticeboard"><span class="nw-kicker">The noticeboard</span><p>At the west library: one umbrella and a jar of screws await their owners. Neither is a new technology.</p><span class="nw-notice-mark" aria-hidden="true">✳</span></aside>`;
}

function renderArticle(story: Story, saved: readonly string[]): string {
  const isSaved = saved.includes(story.id);
  const next = stories[(stories.findIndex((item) => item.id === story.id) + 1) % stories.length];
  return `
    <nav class="nw-breadcrumb" aria-label="Article breadcrumb"><a href="#front-page">Front page</a><span aria-hidden="true">/</span><a href="#section/${story.section}">${e(sectionName(story))}</a><span aria-hidden="true">/</span><span>${e(story.kicker)}</span></nav>
    <article class="nw-article" data-open-story="${story.id}">
      <header class="nw-article-header">
        <p class="nw-kicker">${e(story.kicker)}<span aria-hidden="true"> / </span>Original fiction</p>
        <h2 data-route-heading tabindex="-1">${e(story.title)}</h2>
        <p class="nw-article-deck">${e(story.standfirst)}</p>
        <div class="nw-article-credit"><p><strong>By ${e(story.author)}</strong><span>${e(story.role)}</span></p><p><time datetime="${edition.isoDate}">${e(edition.date)}</time><span>${readingMinutes(story)} min read · Fiction</span></p></div>
        <div class="nw-article-tools">
          <button type="button" class="nw-button" data-save="${story.id}" aria-pressed="${isSaved}">${isSaved ? 'Saved to reading list' : 'Save for later'}</button>
          <button type="button" class="nw-text-button" data-print>Print this story <span aria-hidden="true">↗</span></button>
        </div>
      </header>
      <div class="nw-story-layout">
        <div class="nw-story-main">
          ${figure(story, 'nw-article-figure')}
          <div class="nw-prose">
            <p class="nw-story-dateline">${e(story.dateline)}</p>
            ${story.paragraphs.map((paragraph) => `<p>${e(paragraph)}</p>`).join('')}
            <p class="nw-endmark" aria-label="End of story">◆</p>
          </div>
        </div>
        <aside class="nw-story-margin" aria-label="Story notes">
          <section class="nw-factbox"><p class="nw-kicker">In the margins</p><h3>${e(story.sidebar.title)}</h3><dl>${story.sidebar.items.map((item) => `<div><dt>${e(item.label)}</dt><dd>${e(item.text)}</dd></div>`).join('')}</dl><p class="nw-factbox-note">${e(story.sidebar.note)}</p></section>
          <div class="nw-pullquote"><blockquote><p>“${e(story.pullQuote)}”</p></blockquote><p>From the story</p></div>
          <div class="nw-margin-imprint"><p class="nw-kicker">A dispatch from the possible</p><p>All reporting in this edition takes place inside an invented world. There is no live news feed.</p><a class="nw-read-link" href="#about">About this edition <span aria-hidden="true">↗</span></a></div>
        </aside>
      </div>
      <nav class="nw-next-story" aria-label="Continue reading"><a href="#front-page"><span>Back to the edition</span>← Front page</a><a href="${articleHref(next)}"><span>Next story · ${e(sectionName(next))}</span>${e(next.title)} <span aria-hidden="true">↗</span></a></nav>
    </article>`;
}

function storyRow(story: Story, removable = false): string {
  return `<article class="nw-story-row" data-story="${story.id}">
    ${figure(story, 'nw-row-figure')}
    <div class="nw-row-copy"><p class="nw-kicker">${e(sectionName(story))}<span aria-hidden="true"> / </span>${e(story.kicker)}</p>${headline(story)}<p class="nw-feature-deck">${e(story.standfirst)}</p><p class="nw-reading-copy">${e(story.paragraphs[0])}</p>${byline(story)}<div class="nw-row-actions">${continueLink(story)}${removable ? `<button type="button" class="nw-text-button" data-save="${story.id}" data-remove aria-label="Remove ${e(story.title)} from reading list">Remove <span aria-hidden="true">×</span></button>` : ''}</div></div>
  </article>`;
}

function renderSection(section: NewspaperSection): string {
  const matching = stories.filter((story) => story.section === section.id);
  return `<header class="nw-view-header"><p class="nw-kicker">Section ${section.number} · Original fiction</p><h2 data-route-heading tabindex="-1">${e(section.name)}</h2><p>${e(section.description)}</p><span class="nw-small-label">${matching.length} ${matching.length === 1 ? 'story' : 'stories'} in this edition</span></header><div class="nw-story-list">${matching.map((story) => storyRow(story)).join('')}</div>`;
}

function renderReadingList(saved: readonly string[]): string {
  const selected = saved.map(getStory).filter((story): story is Story => story !== undefined);
  return `<header class="nw-view-header"><p class="nw-kicker">Your own corner of the paper</p><h2 data-route-heading tabindex="-1">Your reading list</h2><p>Keep a story for a quieter moment. Choices are stored only in this browser when storage is available. Nothing is sent anywhere.</p><span class="nw-small-label">${selected.length} ${selected.length === 1 ? 'story' : 'stories'} saved</span></header>
    ${selected.length ? `<div class="nw-story-list">${selected.map((story) => storyRow(story, true)).join('')}</div>` : `<section class="nw-empty-list"><span class="nw-empty-mark" aria-hidden="true">⌑</span><h3>No stories saved yet</h3><p>Open any article and choose “Save for later.” Your newspaper will wait here.</p>${continueLink(stories[0], 'Start with the borrowed cloud')}</section>`}`;
}

function renderAbout(): string {
  return `<header class="nw-view-header"><p class="nw-kicker">From the editorial desk</p><h2 data-route-heading tabindex="-1">A newspaper from a possible tomorrow</h2><p>Not a prediction. Not breaking news. An invitation to imagine what ordinary life might ask of us.</p></header>
    <div class="nw-about-layout"><div class="nw-prose">
      <p>Signals from 2086 is an original fictional future publication. Its first and only edition follows the residents of Port Meridian, an invented coastal city, and the people they correspond with beyond Earth. The publication date belongs to the story world, not to a real news cycle.</p>
      <p>These seven stories ask a common question: when we build something remarkable, who gets to use it? A cloud still needs a lending policy. A quieter train still needs a departure signal. A seed on the Moon still needs somebody to fix the gasket.</p>
      <p>The characters, institutions, reported events, quotations, and municipal figures are invented. The articles are not factual reporting, scientific forecasts, engineering instructions, or descriptions of services you can book. No outside news source is being reproduced or impersonated.</p>
      <h3>A small, complete edition</h3>
      <p>Every headline opens a full article. The section links gather related stories; article addresses can be bookmarked or shared as ordinary URLs. The front page is deliberately finite. There is no automated feed, popularity counter, subscription, or hidden next batch.</p>
      <h3>Made to be read</h3>
      <p>“Larger type” increases the reading text throughout the edition. “Save for later” keeps article choices on this device, when browser storage is available. “Print this story” opens your browser’s print dialog with a simplified reading layout. Printing retains the fiction notice.</p>
      <p>The newspaper requests no remote images, fonts, or news APIs. All seven editorial drawings are original inline SVG illustrations, built from lines, shapes, and a little vermilion ink. Their descriptions and captions carry the meaning when the drawings cannot be seen.</p>
      <p>Thank you for taking the long way through a possible day.</p>
      <a class="nw-read-link" href="#front-page">Return to the front page <span aria-hidden="true">↗</span></a>
    </div><aside class="nw-about-aside" aria-label="Edition details">${figure(stories[0], '', 'An imagined city, drawn one public service at a time.')}<dl><div><dt>Seven</dt><dd>Original, complete stories</dd></div><div><dt>One</dt><dd>Fictional future edition</dd></div><div><dt>No live feeds</dt><dd>Only the world on this page</dd></div></dl></aside></div>`;
}

function renderMissing(path: string): string {
  return `<section class="nw-missing nw-view-header"><p class="nw-kicker">A note from the archive</p><h2 data-route-heading tabindex="-1">That page is not in this edition</h2><p>The address <code>${e(path || '(empty address)')}</code> does not match an article or section. No story has been substituted.</p><a class="nw-button" href="#front-page">Return to the front page</a><p class="nw-small-label">Or choose a section from the newspaper navigation above.</p></section>`;
}

export function renderView(route: NewspaperRoute, saved: readonly string[]): string {
  switch (route.kind) {
    case 'front': return renderFrontPage();
    case 'article': return renderArticle(route.story, saved);
    case 'section': return renderSection(route.section);
    case 'saved': return renderReadingList(saved);
    case 'about': return renderAbout();
    case 'missing': return renderMissing(route.path);
  }
}
