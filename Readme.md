# GameLog

Веб приложение для логирования игровых партий в настольные игры - https://zurginq.github.io/gamelog/

Особенности:
* Данные хранятся оффлайн на устройстве пользователя в IndexedDB и localStorage. Отдельно можно настроить сохранение данных в [yandex cloud](https://yandex.cloud/ru).
* Есть экспорт/импорт данных в json для ручного бэкапа.
* Есть экспорт данных в csv для ручного анализа данных.

## Структура репозитория

Приложение является набором html страниц с js нативным кодом. html страницы собираются с помощью go шаблонизатора. Другой сборки не требуется.

* `docs/` - собранные html файлы, js, css и т.д.
    * `docs/js/` - все js файлы.
    * `docs/*.html` - собранные файлы, перезаписываются сборщиком.
* `pages/` и `layouts/` - исходники html страниц на go шаблонах.
* `builder/` - сборщик html страниц
* `yandex-cloud-api/` - файлы для yandex функций

Шаблонизатор поддерживает специальный синтаксис для автоматического помещения html кода в js переменные

```
{{define "js:pageTitle(game)"}}

${game ? game.gameTitle : 'Добавить партию' }
${game.tags ? ' / ' + game.tags : ''}
(${game.gameDate})

{{end}}
```

Использование требует вставки шаблона `js-templates` в html страницу, что автоматически определит объект `templates` в глобальной области видимости.

```html
<script>
const templates = {
    pageTitle(game) {
        return `
            ${game ? game.gameTitle : 'Добавить партию'}
            ${game.tags ? ' / ' + game.tags : ''}
            (${game.gameDate})
        `;
    }
}
</script>
```

Пример:
```html
{{template "js-templates"}}
<script>
    document.getElementById('pageTitle').innerHTML = templates.pageTitle(game);
</script>
```
