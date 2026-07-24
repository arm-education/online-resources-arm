---
title: 'Teach and learn computing with Arm'
filter: course
layout: article
full_width: true
publication-date: 2025-07-21
---

{%- assign all_collections = site.data -%}
{%- assign datasets = "courseInformation:courses,educationKitInformation:kits,booksInformation:books" | split: "," -%}

{%- for dataset in datasets -%}
  {%- assign pair = dataset | split: ":" -%}
  {%- assign dataset_name = pair[0] -%}
  {%- assign dataset_key = pair[1] -%}
  {%- assign items = all_collections[dataset_name][dataset_key] -%}

  {%- if items -%}
    <details class="resource-section" data-resource-section="{{ dataset_key }}" open>
      <summary class="resource-section__summary">
        <span class="resource-section__title">
          {%- if dataset_key == "kits" -%}Support for educators{%- else -%}{{ dataset_key | capitalize }}{%- endif -%}
        </span>
        <span class="resource-section__count" data-section-count>{{ items | size }} resources</span>
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </summary>

      <div class="resource-section__content">
        {%- if dataset_key == "courses" -%}
          <p class="resource-section__description">
            These freely accessible courses help students, hobbyists, and engineers learn key hardware and software design principles using Arm-based platforms. Many are available on <strong>edX</strong> or <strong>Coursera</strong>.
          </p>
        {%- elsif dataset_key == "books" -%}
          <p class="resource-section__description">
            Arm Education books take learners from foundational knowledge covered by textbooks to expert-level technology overviews in reference books. They support classroom teaching, independent study, and professional development.
          </p>
        {%- elsif dataset_key == "kits" -%}
          <p class="resource-section__description">
            Arm Education Kits provide teaching materials, including lecture slides and lab manuals with solutions, for core engineering, computer science, and related subjects.
          </p>
        {%- endif -%}

        <div class="resource-card-grid">
          {%- for resource in items -%}
            {%- assign canonical_subjects = "" | split: "" -%}
            {%- for catalog_subject in site.data.catalogSubjects.subjects -%}
              {%- assign subject_matches = false -%}
              {%- for source_subject in resource.subjects -%}
                {%- if catalog_subject.source_labels contains source_subject -%}
                  {%- assign subject_matches = true -%}
                {%- endif -%}
              {%- endfor -%}
              {%- if catalog_subject.title_additions contains resource.title -%}
                {%- assign subject_matches = true -%}
              {%- endif -%}
              {%- if subject_matches -%}
                {%- unless canonical_subjects contains catalog_subject.label -%}
                  {%- assign canonical_subjects = canonical_subjects | push: catalog_subject.label -%}
                {%- endunless -%}
              {%- endif -%}
            {%- endfor -%}
            <article
              class="resource-card"
              data-resource-card
              data-title="{{ resource.title | downcase | escape }}"
              data-description="{{ resource.description | strip_html | downcase | escape }}"
              data-facets='{"subjects":{{ canonical_subjects | jsonify | escape }},"level":{{ resource.level | jsonify | escape }},"format":{{ resource.Format | jsonify | escape }},"pathways":{{ resource["Learning Pathways"] | jsonify | escape }}}'>
              <h3 class="resource-card__title">{{ resource.title }}</h3>

              {%- if resource.Subtitle -%}
                <p class="resource-card__subtitle">{{ resource.Subtitle }}</p>
              {%- endif -%}

              {%- if resource.summary -%}
                <p class="resource-card__summary">{{ resource.summary }}</p>
              {%- endif -%}

              {%- if resource.url -%}
                <div class="resource-card__actions">
                  {%- if resource.url contains "[" and resource.url contains "http" -%}
                    {%- comment -%} Skip malformed URL data. {%- endcomment -%}
                  {%- elsif resource.url.size > 0 and resource.url[0] contains "http" -%}
                    {%- for link in resource.url -%}
                      {%- assign domain = link | split: "/" | slice: 2, 1 | first -%}
                      {%- assign parts = domain | split: "." | reverse -%}
                      {%- assign site_name = parts[1] | capitalize -%}
                      {%- assign button_class = "resource-button" -%}
                      {%- unless forloop.first -%}
                        {%- assign button_class = button_class | append: " resource-button--secondary" -%}
                      {%- endunless -%}

                      {%- if resource.title contains "Arm Development Studio" -%}
                        <a class="{{ button_class }}" href="{{ link }}" target="_blank" rel="noopener noreferrer">Request donation</a>
                      {%- elsif link contains "amazon" -%}
                        <a class="{{ button_class }}" href="{{ link }}" target="_blank" rel="noopener noreferrer">Buy from Amazon</a>
                      {%- else -%}
                        <a class="{{ button_class }}" href="{{ link }}" target="_blank" rel="noopener noreferrer">Access via {{ site_name }}</a>
                      {%- endif -%}
                    {%- endfor -%}
                  {%- else -%}
                    {%- assign domain = resource.url | split: "/" | slice: 2, 1 | first -%}
                    {%- assign parts = domain | split: "." | reverse -%}
                    {%- assign site_name = parts[1] | capitalize -%}

                    {%- if resource.title contains "Arm Development Studio" -%}
                      <a class="resource-button" href="{{ resource.url }}" target="_blank" rel="noopener noreferrer">Request donation</a>
                    {%- elsif resource.url contains "amazon" -%}
                      <a class="resource-button" href="{{ resource.url }}" target="_blank" rel="noopener noreferrer">Buy from Amazon</a>
                    {%- else -%}
                      <a class="resource-button" href="{{ resource.url }}" target="_blank" rel="noopener noreferrer">Access via {{ site_name }}</a>
                    {%- endif -%}
                  {%- endif -%}
                </div>
              {%- endif -%}
            </article>
          {%- endfor -%}
        </div>
      </div>
    </details>
  {%- endif -%}
{%- endfor -%}
