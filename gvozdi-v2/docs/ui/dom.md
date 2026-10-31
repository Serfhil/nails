# dom.ts и main.ts — подключение к странице

`main.ts` — точка входа бандла: читает пак из `<script type="application/json" id="pack-data">` и список паков из `<script type="application/json" id="pack-list">` (`parsePackList`, нет — пустой), берёт `createGame` / `loadGame` из `engine/src/index.ts`, вызывает `mount(#app)`, ставит `document.title = view.meta.game_title`. Нет пака — короткое сообщение.

`dom.ts` — `mount(root, opts)`:
- рисует `renderApp` в `root.innerHTML` и перерисовывает при каждом изменении;
- делегирование событий на корне по ближайшему `[data-act]`: `click` — только кнопки; `change` — галочки и списки; `input` — числовые поля рынка;
- нажатие мимо любого элемента с `data-act` шлёт `dd-close` (закрыть выпадающий список);
- нажатие ровно по элементу с `data-backdrop` (фон окна, не его содержимое) шлёт событие из этого атрибута — так окно «Настройки» закрывается тапом мимо (`data-backdrop="settings-close"`);
- после перерисовки возвращает фокус и положение курсора текстовому полю (`INPUT`) и прокрутку списка с `data-scroll`, если в корне есть `querySelector` и `ownerDocument` (в настоящем браузере), чтобы ввод на рынке и галочки склада не сбрасывали положение;
- типы DOM минимальные (`RootLike`, `ElLike`, `DocLike`), поэтому подключение проверяется в Node фейковым корнем (`ui/test/dom.test.ts`), а `boot` из `main.ts` — фейковым документом на фикстуре (`ui/test/engine.test.ts`).
