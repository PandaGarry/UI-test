# Глубокая сверка исполнителя боя (18.10)

Дополнение к `COMBAT-REFERENCE-2026-10-18.md`. Здесь — построчная сверка двух исполнителей:
- эталон: `packages/engine/src/execution/AttackExecution.ts` (577 строк), `GameImpl.conquer` (≈814), `GameImpl.conquerPlayer` (≈1556);
- наш: `packages/core/src/game/attack/AttackExecutor.ts` (209 строк), `AttackActionHandler.ts` (177 строк), `AttackActionValidator.ts`, `GameMode.ts`, `TerritoryManager.conquer`.

Статус: **прочитано полностью**, кроме `conquerPlayer` (≈1600–1640, остаток) и `AttackActionHandler` 128–177 (`handleTerritoryAdd`, `oppose`). Оба места отмечены в конце.

## 1. Инициализация атаки

| Шаг | Эталон (`init`) | Наш код | Статус |
|---|---|---|---|
| Цель отсутствует / сам себе | `hasPlayer` + `owner === target` → неактивна | `canAttack`: только `attacker !== target` (`GameMode.ts`) | частично |
| Союзник / команда | `isFriendly` → неактивна | нет (в ядре нет союзов и команд) | **нет** |
| Эмбарго и отказ от входящих запросов союза | человек против человека: `addEmbargo`, `rejectIncomingAllianceRequests` | нет | **нет** |
| Право атаки игрока | `canAttackPlayer` (иммунитет цели, см. COMBAT §2.6) | нет | **нет** |
| Размер атаки | `startTroops ??= attackAmount`; при `removeTroops`: `min(troops, start)` и `removeTroops()` с учётом округления | размер приходит из пакета (`power × troops / 1000`, `floor`), `actuallyHandleAttack` | совпадает по сути |
| Создание атаки | `createAttack(target, startTroops, sourceTile, Set())` | `new AttackExecutor(player, target, troops, borderTiles)` | совпадает |
| Стартовый фронт | с `sourceTile`: соседи `sourceTile`; без него: `refreshToConquer` по `borderTiles()` | `borderManager.getBorderTiles` → `addNeighbors` | совпадает по смыслу |
| Встречная атака от цели | если входящая больше: входящая уменьшается, атака удаляется, выход; иначе атака уменьшается, входящая удаляется | `attackPlayer`: `opposite.oppose(troops)`; при провале — удалить входящую и продолжить с остатком | совпадает по итогу (проверено по коду `oppose`, равенство: обе стороны гаснут) |
| Слияние с исходящими | исходящие на ту же цель сливаются, **кроме лодочных** (`sourceTile !== null`) | `attackPlayer`: `parent.modifyTroops` без проверки лодочной | **расхождение** (у нас нет лодочной атаки в этом пути; см. §5) |
| Пустой фронт при старте | `retreat()` без малуса, в этот же тик | атака стартует, в первом `tick` без клеток — возврат | **почти**: у нас возврат на тике, у эталона сразу |
| Статистика | `stats().attack`, `attackMaxIncoming` (только после проверки фронта) | нет | **нет** (у нас нет статистики боя) |
| Ответная вражда | если цель — игрок и не Easy и отношение не «враждебное»: `updateRelation(-60 / -70 / -80 / -100)` по сложности | нет | **нет** (отношения отложены, этап 5) |

## 2. Фронт и приоритеты (`addNeighbors`)

Эталон: для каждого из 4 соседей клетки владельца цели, которая не вода и не непроходима:
- клетка добавляется в `attack.borderTiles`;
- `numOwnedByMe` = число соседей клетки, принадлежащих атакующему;
- `mag`: равнина 1, холм 1.5, гора 2, остальное 0 (`terrainType`);
- приоритет = `(random(0..7) + 10) × (1 − 0.5·numOwnedByMe + mag/2) + tickNow`; меньше — раньше.
- Случайность: `PseudoRandom(123)` на **каждую атаку**, сохраняется в снимке.

Наш `AttackExecutor.addFrontier`:
- клетка должна принадлежать цели и быть `conquerable` (не `isWater`/`isImpassable`, а флаг карты);
- приоритет = `(10 + random.nextInt(3)) × (1 + terrainPriorityBonus(terrain)/2) × (1 − 0.1·ownedByMe) + tickCount`;
- случайность — **глобальный** `random` (не привязан к атаке).

**Расхождения (важно для паритета):**
1. Диапазон случайной добавки: эталон 0..7, у нас 0..2 (`nextInt(3)`).
2. Вес соседей: эталон 0.5 на сосед, у нас 0.1.
3. Местность: эталон — слагаемое `mag/2` внутри скобки (1.5 к равнине), у нас — множитель `(1 + bonus/2)`, где бонус берётся из `terrainOf` (по `expansionCost`, а не по `terrainType`).
4. Случайность: эталон — per-attack seed, у нас глобальный поток. Для реплеев и снимков это важно: порядок вызовов `random` у нас зависит от других атак.
5. Горы/холмы: у эталона `mag` = 2 и 1.5 — у нас `terrainOf` даёт класс по порогам 70/80 стоимости расширения; соответствие классов не проверено (нужна таблица соответствия карт).

## 3. Цикл тика (`tick`)

| Элемент | Эталон | Наш | Статус |
|---|---|---|---|
| Отступающая атака | `retreated` → `retreat(25)` для игрока-цели, иначе `retreat()`; `retreating` → тик пропускается | отступление вызывает `retreat` сразу (см. §4) | **расхождение** (нет задержки 20 тиков) |
| Союз создан во время атаки | `retreat()` без малуса | нет проверки | **нет** (нет союзов) |
| Длина фронта | `borderSize = attack.borderSize() + random(0..4)`, фиксируется на тик | `borderSize = max(1, frontier.size)` без случайной добавки | **расхождение** |
| Бюджет | `tickBudget = 1`, `−= tickFraction` | то же | совпадает |
| Проверка клетки | `ownerID(tile) === targetSmallID`, есть сосед владельца, `isLand` и не `isImpassable` | владелец цели, `bordersAttacker`, `conquerable` | почти: `conquerable` вместо `isLand/isImpassable` |
| Удаление из фронта | `attack.removeBorderTile(tile)` до проверки | `popFrontier` удаляет из `frontier` | совпадает |
| Расчёт | `attackLogic(input)` с `defenderHasDefensePost`, `falloutRatio`, `isTraitor`, `isDisconnectedTeammate` (см. COMBAT §2.4) | `attackLogic` без этих полей | **расхождение** (нет постов, фолаута, предателей) |
| Списание | `attack.setTroops`, `targetPlayer.removeTroops(defenderTroopLoss)` | то же | совпадает |
| Захват клетки | `owner.conquer(tile)` → `GameImpl.conquer`: снимает фолаут, обновляет границы, версии | `territoryManager.conquer` → `TerritoryTransaction`; фолаута нет | совпадает (кроме фолаута: в нашем ядре ядерных ударов нет) |
| Смерть защитника | `handleDeadDefender`: при `numTilesOwned < 100` → `conquerPlayer` и добивание оставшихся клеток (до 100 проходов) | `convertEnclaves` при `troops < 1` (см. §6) | **расхождение, важное** |
| Пустой фронт в конце | `refreshToConquer()` и `retreat()` без малуса | `return false` (войска возвращаются в `attackActionHandler.tick`) | совпадает по итогу |
| Войск меньше 1 | `attack.delete()`, атака неактивна | `return false` | совпадает |

## 4. Отступление

- Эталон `retreat(malusPercent)`: `deaths = troops × malus/100`; при `removeTroops === false` и `sourceTile === null` из войск вычитается `startTroops`; `survivors = troops − deaths` возвращаются; сообщение `attack_cancelled_retreat`, если `deaths > 0`; статистика `attackCancel`, только если атака была отменой.
- Наш `AttackActionHandler.retreat(attack)`: проверяет, что атака в списке; возвращает `getTroops()` целиком; `removeAttack`. Без малуса, без задержки, без сообщения, без статистики.
- Вызов: `GameHud.ts` (кнопка отмены в списке исходящих атак) → `attackActionHandler.retreat`. Событие в ядре: нет.
- **Итог:** отступление по кнопке у нас мгновенное и без штрафа, у эталона — 2 секунды (20 тиков, `RetreatExecution.cancelDelay`) и 25 % против игрока.

## 5. Лодочная атака

- Эталон: `TransportShipExecution` создаёт `AttackExecution(boat.troops(), attacker, target, dst, false)`: `removeTroops = false`, `sourceTile = dst`. Войска снимаются при отплытии (в лодке). При отмене `sourceTile !== null` — возврат полный (но малус 25 % против игрока-цели сохраняется).
- Наш код: лодочной атаки в ядре атак нет (`AttackExecutor` не принимает `sourceTile`). Морская атака у нас описана в `RadialMenu`/`MapActionHandler.boatAttack` — путь ядра не сверён; **отдельная проверка нужна в этапе 0** (`boatManager`, `Boat.ts`).

## 6. Смерть противника и захват целиком

Эталон `conquerPlayer(conqueror, conquered)` (`GameImpl.ts`, ≈1556–1638):
1. Если противник отключён и в одной команде с атакующим — захват его кораблей (Warship, TransportShip).
2. Золото: `skipGoldTransfer = attacksSent === 0 && conquered.type() === Human` — если человек ни разу не атаковал, золото не переходит, сообщение `conquered_no_gold`; иначе переход `conquered.gold()` + `conquerGoldAmount(conquered)`, сообщение `received_gold_from_conquest`.
3. Событие `ConquestEvent` (`conquerorId`, `conqueredId`, `gold`) — клиент: звук и визуальный эффект (см. `TERRITORY-VISUAL-REFERENCE-2026-10-18.md`).
4. Добивание: `handleDeadDefender` вызывает `conquerPlayer` и захватывает оставшиеся клетки цели по двум правилам: клетка соседствует с клеткой атакующего — берётся атакующим; иначе — клетка соседа-врага (не союзника цели) переходит этому соседу.

Наш код:
- `convertEnclaves(defeated)` вызывается в `finally` каждого тика атаки, если `target.getTroops() < 1`. Правило: клетка цели, у которой все четыре стороны принадлежат одному победителю, переходит этому победителю. **Комментарий в коде называет это «reference behaviour», но в эталоне такого правила нет**: там порог — число клеток (`< 100`), а не войска, и алгоритм другой. Требует исправления (этап 1).
- Нет: переноса золота, захвата кораблей, `ConquestEvent`, статистики смерти, правила `< 100 клеток`, добивания по соседям.
- Игрок без клеток: нет события «выбыл», нет проверки `isAlive` в `GameMode` (кроме лодок: `Boat.ts:100 owner.isAlive()`). Поведение смерти нужно описать в этапе 1 отдельно.

## 7. Что проверено и что не проверено

- Проверено по коду: все строки `AttackExecution.ts` 1–577 (кроме снимков и `zod`-схем), `AttackExecutor.ts` 1–209, `AttackActionHandler.ts` 1–128, `AttackActionValidator.ts` первые 40 строк (валидатор пакета и `actuallyHandleAttack`; файл ≈50 строк), `GameMode.canAttack`, `TerritoryManager.conquer`.
- Не проверено: остаток `conquerPlayer` (≈1600–1640), `AttackActionHandler.ts` 128–177 (`handleTerritoryAdd`), поведение при `removeTroops === false` в нашем пути (лодки), поведение `Boat.ts` при смерти владельца.
- Не запускались: тесты эталона (`tests/AttackScenarios.test.ts` и др.), перф-замеры.
