---
title: 'Teach and learn computing with Arm'
filter: course
layout: article
publication-date: 2025-07-21
---

<!-- Grid Container -->
{% assign all_collections = site.data %} 

{% assign datasets = 
  "courseInformation:courses,
   educationKitInformation:kits,
   booksInformation:books" | split: "," %}

{% for dataset in datasets %} 
  {% assign pair = dataset | split: ":" %}
  {% assign dataset_name = pair[0] | strip %}
  {% assign dataset_key = pair[1] | strip %} 
  {% assign items = all_collections[dataset_name][dataset_key] %}
<div class="course-grid" id="course-grid">
  {% if items %}
    {% assign grouped = items | group_by_exp: "item", "item.Format | join: ', '" %}
    
    <div class="collapsible-section">
      <!-- Section toggle button -->
      <button class="collapsible-toggle" onclick="toggleSection('{{ dataset_key }}')">
        <span>{% if dataset_key == "kits" %}Support for educators{% else %}{{ dataset_key | capitalize }}{% endif %}</span>
        <span class="chevron">&#9660;</span>
      </button>

      <!-- Collapsible content -->
      <div class="collapsible-content" id="section-{{ dataset_key }}">
        {% for group in grouped %}
          <div class="course-section">
            <!--<h3 class="group-title">Format: {{ group.name }}</h3>-->
            {% if group.name == "Course" %}
              <p>
                These freely accessible courses help students, hobbyists, and engineers learn key hardware and software design principles using Arm-based platforms. Many are available on <strong>edX</strong> or <strong>Coursera</strong>.
              </p>
            {% endif %}
            {% if group.name == "Books" %}
              <p>
                Arm Education books program aims to take learners from foundational knowledge and skills covered by its textbooks to expert-level overviews of Arm-based technologies through its reference books. Textbooks are suitable for classroom adoption in Electrical Engineering, Computer Engineering and related areas. Reference books are suitable for graduate students, researchers, aspiring and practising engineers. .
              </p>
            {% endif %}
            {% if group.name == "Education Kit" %}
              <p>
                To help faculty teach the latest technology from Arm and its ecosystem, the Arm University Program has developed a suite of Education Kits in a range of core subjects relevant to Electrical, Electronic and Computer Engineering, Computer Science and beyond.  An Education Kit comprises a full set of teaching materials including lecture slides and lab manuals with solutions. .
              </p>
            {% endif %}
            {% if group.name == "other" %}
              <p>
                Access tools, webinars and other resources to enhance your teaching, learning and research outcomes.  
              </p>
            {% endif %}
            <div class="course-card-grid" id="{{ dataset_key }}-grid">
              {% for course in group.items %}
                <div class="course-card"
                  data-keywords="{{ course.subjects | join: ' ' }} {{ course.platform | join: ' ' }} {{ course['sw-hw'] | join: ' ' }} {{ course.level | join: ' ' }} {{ course.publisher | join: ' ' }}  {{ course.Format | join: ' ' }} {{ course["Learning Pathways"]| join: ' ' }}"
                  data-title="{{ course.title | downcase | escape }}"
                  data-description="{{ course.description | strip_html | downcase | escape }}">

                  <h3 class="course-title">{{ course.title }}</h3>
                  {% if course.Subtitle %}
                    <p class="course-subtitle">
                      {{ course.Subtitle }}
                    </p>
                  {% endif %}
                  {% if course.summary %}
                    <p class="course-summary">{{ course.summary }}</p>
                  {% endif %}
                  {% if course.url %}
                    <div class="course-card__actions">
                    {% if course.url contains "[" and course.url contains "http" %}
                      {# Skip if it's malformed #}
                    {% elsif course.url.size > 0 and course.url[0] contains "http" %}
                      {% for link in course.url %}
                        {% assign domain = link | split: "/" | slice: 2, 1 | first %}
                        {% assign parts = domain | split: "." | reverse %}
                        {% assign site_name = parts[1] | capitalize %}

                        {% if course.title contains "Arm Development Studio" %}
                          <a class="button donation-button" href="{{ link }}" target="_blank">
                            Request Donation
                          </a>
                        {% elsif link contains "amazon" %}
                          <a class="button amazon-button" href="{{ link }}" target="_blank">
                            Buy from Amazon
                          </a>
                        {% else %}
                          <a class="button" href="{{ link }}" target="_blank">
                            Access via {{ site_name }}
                          </a>
                        {% endif %}
                      {% endfor %}
                    {% else %}
                      {% assign domain = course.url | split: "/" | slice: 2, 1 | first %}
                      {% assign parts = domain | split: "." | reverse %}
                      {% assign site_name = parts[1] | capitalize %}

                      {% if course.title contains "Arm Development Studio" %}
                        <a class="button donation-button" href="{{ course.url }}" target="_blank">
                          Request Donation
                        </a>
                      {% elsif course.url contains "amazon" %}
                        <a class="button amazon-button" href="{{ course.url }}" target="_blank">
                          Buy from Amazon
                        </a>
                      {% else %}
                        <a class="button" href="{{ course.url }}" target="_blank">
                          Access via {{ site_name }}
                        </a>
                      {% endif %}
                {% endif %}
                    </div>
              {% endif %}
                </div>
              {% endfor %}
            </div>
            <div class="no-results-message"
              style="display:none;text-align:center;margin-top:1rem;">
            <p><strong>No {{ dataset_key | capitalize }} matched your filters.</strong></p>
          </div>
        </div><!-- close .course-section -->
        {% endfor %}
        <div class="collapsible-spacer"></div>
      </div>
    </div>
  {% endif %}
  </div>
{% endfor %}


<!-- No Results Message -->
<div id="no-results" style="display: none; text-align: center; margin-top: 2rem;">
  <p><strong>No results found.</strong><br>Try adjusting your filters or search terms.</p>
</div>

<link rel="stylesheet" href="{{ '/assets/css/index.css' | relative_url }}">

<!-- this Js handels the toggle section -->

<script>
  function toggleSection(key) {
    const section = document.getElementById('section-' + key);
    const container = section.parentElement;
    const isActive = container.classList.contains('active');

    if (isActive) {
      // Collapse section
      section.style.height = section.scrollHeight + 'px';
      requestAnimationFrame(() => {
        section.style.height = '0px';
        container.classList.remove('active');
      });
    } else {
      // Expand section
      section.style.height = section.scrollHeight + 'px';
      container.classList.add('active');  
      
      filterAndSearchCourses();

      section.addEventListener('transitionend', function resetHeight() {
        section.style.height = 'auto';
        section.removeEventListener('transitionend', resetHeight);
        filterAndSearchCourses();
      });
    }
  }

  function resetSectionHeight(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    // If it’s expanded, recalculate height based on updated content
    const container = section.parentElement;
    if (container.classList.contains('active')) {
      section.style.height = 'auto'; // reset temporarily to get true scrollHeight
      const newHeight = section.scrollHeight;
      section.style.height = newHeight + 'px';
    }
  }

</script>

