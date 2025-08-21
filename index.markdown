---
layout: default
title: Home
---

<h2>Hello.</h2>
<p>posting about my thoughts and things that interest me.</p>

<h2>Latest Posts</h2>
<ul class="latest-posts">
  {% for post in site.posts limit:3 %}
    <li>
      <span>
        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y-%m-%d" }}</time>
      </span>
      <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
    </li>
  {% endfor %}
  </ul>


