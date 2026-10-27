---
layout: default
title: Home
inset: true
---

<p class="intro-line translatable" data-en="Hi, I'm João Lucas Martinello." data-pt="Olá, me chamo João Lucas Martinello.">Hi, I'm João Lucas Martinello.</p>
<p class="intro">
  <span class="translatable" data-en="Software Developer Intern at " data-pt="Software Developer Intern na ">Software Developer Intern at </span>@HP. <span class="translatable" data-en="Experience with web development, AI applications, and data engineering. CS student at PUCRS." data-pt="Experiência com desenvolvimento web, aplicações de IA e engenharia de dados. Estudante de Ciência da Computação na PUCRS.">Experience with web development, AI applications, and data engineering. CS student at PUCRS.</span>
</p>

{% if site.show_blog %}
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
{% endif %}
