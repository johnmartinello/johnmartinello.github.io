---
layout: default
title: Home
---

<h2 class="translatable" data-en="Hello." data-pt="Olá.">.</h2>
<p class="translatable" data-en="posting about my thoughts and things that interest me." data-pt="postando sobre meus pensamentos e coisas que me interessam."></p>

<h2 class="translatable" data-en="Latest Posts" data-pt="Posts Recentes">Latest Posts</h2>
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


