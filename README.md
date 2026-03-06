# Arm Education Online Resources – GitHub Pages Site

This repository contains the source code for a GitHub Pages site that aggregates and presents **Arm Education online resources**, including:

* Courses
* Education Kits
* Books
* Workshops
* Additional teaching and learning resources

The site dynamically builds resource listings from structured data files and presents them in grouped, filterable, collapsible sections.

## Overview

The site:

* Uses **Jekyll** and GitHub Pages
* Pulls content from `_data` collections
* Groups resources by format (e.g., Course, Books, Education Kit, Other)
* Generates resource cards with:

  * Title and subtitle
  * Description metadata
  * Platform-aware external links (e.g., edX, Coursera, Amazon)
* Supports keyword-based filtering via embedded metadata attributes

## Repository Structure

* `index.html` – Main page layout and rendering logic
* `_data/` – Structured resource datasets (courses, kits, books, etc.)
* Supporting assets – CSS, scripts, and layout components used by the site

## How It Works

The index page:

1. Loads datasets from `site.data`
2. Iterates through defined collections
3. Groups items by `Format`
4. Renders responsive “course cards”
5. Dynamically generates external access buttons based on URL type

The site is fully static and designed to be hosted via **GitHub Pages**.

## Purpose

This repository exists to provide a maintainable, data-driven way to publish and organize Arm Education resources for students, educators, and engineers.
