# Blog post structured data — parked spec

**Status:** not implemented. Waiting on the first published blog post.
**Trigger:** implement when an article is live on the `news` blog.

As of parking, the store has one blog (`News`) with no articles returned by the
Admin API, and **no ARTICLE metafield definitions exist at all** — so the
namespace below is unclaimed. Re-check both before implementing.

---

## 1. Replace the filter, don't extend it

`sections/main-blog-post.liquid` currently ends with:

```liquid
<script type="application/ld+json">
  {{ article | structured_data }}
</script>
```

That filter emits a fixed BlogPosting shape and cannot express `reviewedBy`,
author `jobTitle`, or an author URL. **Delete that whole block** (it was lines
62–64) and paste the replacement in the same place — after the closing `</div>`
of the section wrapper, before `{% stylesheet %}`. Two article-level schema
blocks on one page is not acceptable, so it is a replacement, not an addition.

Leave the other four `structured_data` calls alone — they are product schema on
different sections:

- `sections/product-information.liquid`
- `sections/featured-product.liquid`
- `sections/featured-product-information.liquid`

`sections/header.liquid` also emits sitewide **Organization** JSON-LD. Keep it.
The `publisher` node inside BlogPosting is separate and expected.

---

## 2. Metafield definitions to create

Settings → Custom data → **Blog posts**. Shopify defaults the namespace to
`custom`; open the namespace-and-key field and set `fortified` so it matches the
Liquid below.

| Name | Namespace and key | Type |
|---|---|---|
| Author name | `fortified.author_name` | Single line text |
| Author URL | `fortified.author_url` | URL |
| Author job title | `fortified.author_job_title` | Single line text |
| Reviewer name | `fortified.reviewer_name` | Single line text |
| Reviewer URL | `fortified.reviewer_url` | URL |
| Reviewer job title | `fortified.reviewer_job_title` | Single line text |
| FAQs | `fortified.faqs` | Metaobject → **FAQ Item**, "List of entries" enabled |

The FAQ field reuses the existing `faq_item` metaobject (`question` / `answer`),
so blog and PDP FAQs share one content type. Field access pattern verified
against `sections/ftd-b-faq.liquid`, which uses `f.question` / `f.answer` off
`.value`.

---

## 3. The Liquid

```liquid
{%- liquid
  assign mf = article.metafields.fortified

  assign author_name = mf.author_name.value | default: article.author
  assign author_url  = mf.author_url.value
  assign author_job  = mf.author_job_title.value
  assign rev_name    = mf.reviewer_name.value
  assign rev_url     = mf.reviewer_url.value
  assign rev_job     = mf.reviewer_job_title.value

  assign page_url = request.origin | append: article.url

  assign art_image = ''
  if article.image
    assign art_image = article.image | image_url: width: 1200 | prepend: 'https:'
  endif

  assign pub_logo = ''
  if settings.logo
    assign pub_logo = settings.logo | image_url: width: 500 | prepend: 'https:'
  endif

  assign faq_entries = mf.faqs.value
  assign faq_count = 0
  if faq_entries != blank
    for f in faq_entries
      if f.question != blank and f.answer != blank
        assign faq_count = faq_count | plus: 1
      endif
    endfor
  endif
-%}

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": {{ article.title | json }},
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": {{ page_url | json }}
  },
  "url": {{ page_url | json }},
  "datePublished": {{ article.published_at | date: '%Y-%m-%dT%H:%M:%S%z' | json }},
  "dateModified": {{ article.updated_at | default: article.published_at | date: '%Y-%m-%dT%H:%M:%S%z' | json }},
  "publisher": {
    "@type": "Organization",
    "name": {{ shop.name | json }}{% if pub_logo != blank %},
    "logo": {
      "@type": "ImageObject",
      "url": {{ pub_logo | json }}
    }{% endif %}
  }{% if article.excerpt_or_content != blank %},
  "description": {{ article.excerpt_or_content | strip_html | strip | truncate: 300 | json }}{% endif %}{% if art_image != blank %},
  "image": {{ art_image | json }}{% endif %}{% if author_name != blank %},
  "author": {
    "@type": "Person",
    "name": {{ author_name | json }}{% if author_job != blank %},
    "jobTitle": {{ author_job | json }}{% endif %}{% if author_url != blank %},
    "url": {{ author_url | json }}{% endif %}
  }{% endif %}{% if rev_name != blank %},
  "reviewedBy": {
    "@type": "Person",
    "name": {{ rev_name | json }}{% if rev_job != blank %},
    "jobTitle": {{ rev_job | json }}{% endif %}{% if rev_url != blank %},
    "url": {{ rev_url | json }}{% endif %}
  }{% endif %}
}
</script>

{%- if faq_count > 0 -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
{%- assign faq_i = 0 -%}
{%- for f in faq_entries -%}
  {%- if f.question != blank and f.answer != blank -%}
    {%- if faq_i > 0 %},{% endif %}
    {
      "@type": "Question",
      "name": {{ f.question | json }},
      "acceptedAnswer": {
        "@type": "Answer",
        "text": {{ f.answer | strip_html | strip | json }}
      }
    }
    {%- assign faq_i = faq_i | plus: 1 -%}
  {%- endif -%}
{%- endfor %}
  ]
}
</script>
{%- endif -%}
```

### Why it is written this way

- `headline` through `publisher` always render, so every optional property
  carries a **leading** comma. A trailing comma is structurally impossible.
- The FAQ loop uses a counter, not `forloop.last`. `forloop.last` breaks the
  moment an entry is skipped for a blank question or answer.
- `| prepend: 'https:'` on images matches `sections/header.liquid` (line ~293),
  which confirms `image_url` returns protocol-relative URLs on this Shopify
  version. If Shopify switches to absolute URLs this produces
  `https:https://…` — check view-source after deploying.
- All escaping goes through `| json`. No hand-written quotes.

---

## 4. Delete the `<h1>` from article body HTML

`templates/article.json` sets the `blog-post-title` block's text to literally
`<h1>{{ article.title }}</h1>`, so the template already emits an h1 outside the
body. Any `<h1>` in the body HTML is a duplicate.

---

## 5. Blockers and caveats

**FAQ content must be visible on the page.** Google requires marked-up content
to be visible to users. FAQs that live only in a metafield and are never
rendered violate the structured data guidelines and can attract a manual action.
Render them too — `sections/ftd-b-faq.liquid` already reads `faq_item`
metaobjects, so it mostly needs pointing at the article metafield. **Do not ship
the FAQ schema without the visible content.**

**FAQ rich results are unlikely.** Since 2023 Google restricts FAQ rich results
to well-known government and health sites. The markup stays valid and useful to
other consumers, but expect no snippet change for a supplement brand.

**`reviewedBy` is schema.org-valid but not a documented Google Article
property.** Correct vocabulary for medically reviewed content; won't surface
visibly. If the medical-review semantics should carry more weight, consider
typing the page as `MedicalWebPage` alongside `BlogPosting`.

**Verify `article.updated_at`.** It is the documented field but can bump on
unrelated saves. If `dateModified` proves noisy, swap in a manual
`fortified.date_modified` date metafield.

**Verify after deploying:** exactly one BlogPosting block on the page, image
URLs not double-prefixed, and valid JSON when every optional metafield is empty
(test with a bare article that has no author/reviewer/FAQ values set).
