import { prisma } from '@/lib/prisma'

// Categories are pages with children — there is no separate entity. The seed shows that shape: two top-level sections
// (Windows, Сети), each with a sub-section (Server, Cisco), each with one real article, plus a standalone "start here"
// page at the root.
type SeedPage = {
  slug: string
  title: string
  parent: string | null
  position: number
  content: string
}

const pages: SeedPage[] = [
  {
    slug: 'nachalo-raboty',
    title: 'Начало работы',
    parent: null,
    position: 0,
    content: `Как устроена эта вики и с чего начать.

## Разделы и статьи

Дерево строится из страниц: страница с дочерними — это **раздел** (категория), страница без дочерних — **статья**.
Отдельных «категорий» в базе нет, и это осознанно: принадлежность статьи к категории — это её родитель.

На странице раздела под текстом автоматически появляется список того, что внутри.

## Как добавить статью

1. Откройте **Admin → Wiki → New page**.
2. Заголовок — slug сгенерируется транслитом (кириллица → латиница), его можно поправить.
3. Выберите родителя: например, чтобы статья попала в «Сети → Cisco», укажите родителем Cisco.
4. Пишите в визуальном редакторе; картинка вставляется кнопкой в тулбаре и грузится в \`uploads/wiki/<год>/<месяц>\`.
`,
  },
  {
    slug: 'windows',
    title: 'Windows',
    parent: null,
    position: 1,
    content: `Всё про Windows: серверные и клиентские версии, развёртывание, обслуживание.

Разделы внутри выбирайте в списке ниже.
`,
  },
  {
    slug: 'windows-server',
    title: 'Server',
    parent: 'windows',
    position: 0,
    content: `Windows Server: роли, установка, обслуживание и типовые проблемы.

Коротко о том, что здесь будет: установка сервера, роли Hyper-V/AD/DNS, обновления, резервные копии.
`,
  },
  {
    slug: 'windows-server-install',
    title: 'Установка Windows Server',
    parent: 'windows-server',
    position: 0,
    content: `Пошаговая установка Windows Server на чистую машину или виртуалку.

## Требования

- 4 ГБ RAM минимум (для ролей — от 8 ГБ)
- 64 ГБ диска под систему
- ISO нужной редакции (Standard или Datacenter)

## Установка

1. Загрузитесь с ISO и выберите язык и раскладку.
2. «Установить сейчас» → редакция → «Выборочная: только установка Windows».
3. Разметьте диск (на виртуалке — один раздел).
4. Задайте пароль администратора и дождитесь перезагрузки.

## После установки

Проверьте, что всё поднялось:

\`\`\`powershell
# имя компьютера и домен
hostname
(Get-CimInstance Win32_ComputerSystem).Domain

# версия и сборка
[System.Environment]::OSVersion.Version
Get-ComputerInfo | Select-Object WindowsProductName, OsBuildNumber

# сеть
Get-NetIPConfiguration
\`\`\`

## Частые проблемы

| Симптом | Причина |
| --- | --- |
| «Windows не удаётся установить на этот диск» | диск GPT, а загрузка в Legacy BIOS |
| Нет сети после установки | не установлены драйверы VirtIO/сетевой карты |
| Запрос пароля не появляется | включён автологин в unattend-файле |
`,
  },
  {
    slug: 'seti',
    title: 'Сети',
    parent: null,
    position: 2,
    content: `Раздел про сети: коммутаторы, маршрутизация, VLAN, диагностика.

Начните с подраздела Cisco или добавляйте свои — например, «MikroTik» или «IP-адресация».
`,
  },
  {
    slug: 'cisco',
    title: 'Cisco',
    parent: 'seti',
    position: 0,
    content: `Cisco: первоначальная настройка коммутаторов и маршрутизаторов, VLAN, типовые команды.
`,
  },
  {
    slug: 'cisco-basic-setup',
    title: 'Базовая настройка Cisco',
    parent: 'cisco',
    position: 0,
    content: `Минимальный набор команд, чтобы устройство стало управляемым и безопасным.

## Подключение

Консольный кабель → порт \`console\` → терминал **9600 8N1**, без flow control. Нажмите Enter — появится приглашение
\`Switch>\`.

## Настройка

\`\`\`text
enable
configure terminal
hostname sw-01
enable secret StrongPass1
username admin privilege 15 secret AnotherStrongPass

line console 0
 password ConsolePass1
 login

interface vlan 1
 ip address 192.168.10.2 255.255.255.0
 no shutdown
exit
ip default-gateway 192.168.10.1

end
write memory
\`\`\`

## Проверка

- \`show running-config\` — что реально применено;
- \`show ip interface brief\` — адреса и состояние портов;
- \`show vlan brief\` — VLAN и их порты;
- \`ping 192.168.10.1\` — доступность шлюза.

> После \`write memory\` конфигурация переживёт перезагрузку. До этого она только в RAM.
`,
  },
]

export const seed = async () => {
  await prisma.wikiPage.deleteMany()

  // Top-down, but indifferent to the array order: a page is created as soon as its parent exists.
  const ids = new Map<string, string>()
  const remaining = [...pages]
  while (remaining.length > 0) {
    const ready = remaining.filter((page) => !page.parent || ids.has(page.parent))
    if (ready.length === 0) {
      throw new Error(`Seed: unknown parent or cycle in ${remaining.map((page) => page.slug).join(', ')}`)
    }
    for (const page of ready) {
      const created = await prisma.wikiPage.create({
        data: {
          slug: page.slug,
          title: page.title,
          content: page.content,
          position: page.position,
          parentId: page.parent ? (ids.get(page.parent) ?? null) : null,
        },
        select: { id: true },
      })
      ids.set(page.slug, created.id)
      remaining.splice(remaining.indexOf(page), 1)
    }
  }
}

if (import.meta.main) {
  seed()
    .then(() => {
      console.info(`Seeded ${pages.length} wiki pages.`)
    })
    .catch((error) => {
      console.error('Seed failed.', error)
      process.exitCode = 1
    })
}
