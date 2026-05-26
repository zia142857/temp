/**
 * Points - 积分管理器（包含 PointsManager 和 PointsPageManager）
 */

const {
    LogTag, LogIndent,
    REWARDS_URL, REWARDS_EARN_URL, REWARDS_BASE_URL,
    sleep, randFloat, extractInt
} = require('./utils')

// ===========================
// PointsManager 类
// ===========================

/**
 * 积分管理类 - 获取和解析积分信息
 */
class PointsManager {
    constructor(browserMgr) {
        this.browserMgr = browserMgr
        this.page = browserMgr.page
        this.lastRscData = ''
    }

    /**
     * 获取积分信息
     */
    async getRewardsPoints(silent = false) {
        try {
            let rscData = ''

            // 尝试访问新版 /earn 页面
            try {
                await this.page.goto(REWARDS_EARN_URL, { waitUntil: 'networkidle', timeout: 45000 })
                await sleep(randFloat(2000, 3000))

                rscData = await this.page.content()
                rscData = rscData.replace(/\\"/g, '"').replace(/\\\\/g, '\\')

                // 检查是否是 404 页面
                if (rscData.includes('rewards-404-error') || rscData.includes('积分商城错误') || rscData.includes('"statusCode":404')) {
                    // 新版返回404，不支持新版功能，返回 null 表示不执行任务
                    if (!silent) console.log(`${LogTag.POINTS} /earn 返回404，跳过积分页面任务`)
                    return null
                }
            } catch (e) {
                if (!silent) console.log(`${LogTag.POINTS} 访问 /earn 失败: ${e.message}`)
                return null
            }

            this.lastRscData = rscData
            return this._parseNewVersion(rscData)
        } catch (e) {
            console.log(`${LogTag.POINTS} 获取积分异常: ${e.message}`)
            await this.browserMgr.screenshot('points_get_exception')
            await this.browserMgr.saveHTML('points_get_exception')
            return null
        }
    }

    /**
     * 解析页面数据
     */
    _parseNewVersion(rscData) {
        // 总积分
        let points = extractInt(/balance"\s*:\s*(\d+)/, rscData)
        if (!points) points = extractInt(/"balance"\s*:\s*(\d+)/, rscData)

        // 今日积分
        const todayPoints = extractInt(/totalPoints"\s*:\s*(\d+)/, rscData)

        // 搜索进度 - 从 pointsCounters 中提取 pc.max 和 pc.progress
        let searchProgress = 0, searchMax = 0
        const countersMatch = rscData.match(/pointsCounters"\s*:\s*\{[^}]*"pc"\s*:\s*\{([^}]+)\}/)
        if (countersMatch) {
            const pcBlock = countersMatch[1]
            const maxM = pcBlock.match(/"max"\s*:\s*(\d+)/)
            const progM = pcBlock.match(/"progress"\s*:\s*(\d+)/)
            if (maxM) searchMax = parseInt(maxM[1], 10)
            if (progM) searchProgress = parseInt(progM[1], 10)
        }

        const remaining = searchMax > 0 ? Math.floor((searchMax - searchProgress) / 3) : 0
        return {
            points, today_points: todayPoints,
            search: { progress: searchProgress, max: searchMax, remaining },
            quests: this._parseQuests(rscData),
            is_new_version: true
        }
    }

    /**
     * 解析打卡任务
     */
    _parseQuests(rscData) {
        const quests = { earned: 0, total: 0, progress: 0, max: 0 }
        try {
            const questIdx = rscData.indexOf('Earn_QuestSection')
            if (questIdx !== -1) {
                const questSection = rscData.slice(questIdx, Math.min(rscData.length, questIdx + 15000))
                const progMatch = questSection.match(/(\d+)\s*\/\s*(\d+)/)
                if (progMatch) {
                    quests.progress = parseInt(progMatch[1], 10)
                    quests.max = parseInt(progMatch[2], 10)
                }
                const ptsMatch = questSection.match(/\[\s*"\+"\s*,\s*"(\d+)"\s*\]/)
                if (ptsMatch) quests.total = parseInt(ptsMatch[1], 10)
                if (quests.progress >= quests.max && quests.max > 0) quests.earned = quests.total
            }
        } catch (e) {}
        return quests
    }

    /**
     * 从搜索结果页面获取当前积分
     */
    async getPointsFromPage() {
        try {
            const pointsEl = await this.page.$('.points-container')
            if (pointsEl) {
                const text = await pointsEl.textContent()
                const num = parseInt(text.trim(), 10)
                return isNaN(num) ? null : num
            }
        } catch (e) {}
        return null
    }
}

// ===========================
// PointsPageManager 类
// ===========================

/**
 * 积分页面任务管理类
 */
class PointsPageManager {
    constructor(browserMgr) {
        this.browserMgr = browserMgr
        this.browser = browserMgr.context
        this.page = browserMgr.page
        this.stats = {
            claimedPoints: 0,
            punch: { done: 0, total: 0 },
            activity: { done: 0, total: 0 },
            daily: { done: 0, total: 0 }
        }
    }

    /**
     * 重置统计
     */
    _resetStats() {
        this.stats = {
            claimedPoints: 0,
            punch: { done: 0, total: 0 },
            activity: { done: 0, total: 0 },
            daily: { done: 0, total: 0 }
        }
    }

    /**
     * 完成积分页面任务
     */
    async completePointsTasks(accountIndex) {
        console.log(`${LogTag.ACTIVITY} 账号${accountIndex} 扫描积分页面任务...`)
        this._resetStats()

        try {
            // dashboard
            console.log(`${LogIndent.ITEM}切换网页：${REWARDS_URL}`)
            await this.page.goto(REWARDS_URL, { waitUntil: 'networkidle', timeout: 45000 })
            await sleep(randFloat(5000, 8000))
            await this._claimDashboardPoints()
            await sleep(randFloat(1000, 3000))
            await this._processDailyActivities()
            await sleep(randFloat(1000, 3000))

            // earn
            console.log(`${LogIndent.ITEM}切换网页：${REWARDS_EARN_URL}`)
            await this.page.goto(REWARDS_EARN_URL, { waitUntil: 'networkidle', timeout: 45000 })
            await sleep(randFloat(5000, 8000))
            await this._processDailyActivities()
            await sleep(randFloat(1000, 3000))
            await this._processPunchCards()
            await sleep(randFloat(1000, 3000))
            await this._processActivities()
            await sleep(randFloat(1000, 3000))

            console.log(`${LogIndent.END}积分页面任务处理完毕`)
        } catch (e) {
            console.log(`${LogTag.ACTIVITY} 任务流程异常: ${e.message}`)
            await this.browserMgr.screenshot('points_tasks_exception')
            await this.browserMgr.saveHTML('points_tasks_exception')
        }
    }

    /**
     * 领取仪表板积分
     */
    async _claimDashboardPoints() {
        try {
            // 查找"可领取"卡片: <button> 内含 <p class="text-labelControl">可领取</p> 和 <p class="text-pageHeader">积分值</p>
            let claimCard = await this.page.$('xpath=//button[.//p[@class="text-labelControl" and text()="可领取"]]')

            if (!claimCard) {
                console.log(`${LogIndent.ITEM}未发现可领取模块`)
                return
            }

            const cardText = await claimCard.textContent()
            const pointsMatch = cardText.replace(/,/g, '').match(/(\d+)/)
            const claimPoints = pointsMatch ? parseInt(pointsMatch[1], 10) : 0

            if (claimPoints <= 0) {
                console.log(`${LogIndent.ITEM}没有待领取的积分`)
                return
            }

            console.log(`${LogIndent.ITEM}发现待领取: ${claimPoints} 分`)
            // 点击卡片，打开领取 flyout 对话框
            await claimCard.click()
            await sleep(randFloat(3000, 5000))

            // flyout 中的"领取积分"按钮: <button><span>领取积分</span></button>
            const claimBtn = await this.page.$('xpath=//button[.//span[text()="领取积分"]]')
            if (claimBtn) {
                try { await claimBtn.scrollIntoViewIfNeeded(); } catch (e) {}
                await sleep(500)
                await claimBtn.click()
                await sleep(randFloat(2000, 3000))
                console.log(`${LogIndent.ITEM}已领取 ${claimPoints} 分`)
                this.stats.claimedPoints = claimPoints

                // 关闭 flyout
                const closeBtn = await this.page.$('xpath=//button[@aria-label="关闭"]')
                if (closeBtn) {
                    try { await closeBtn.click(); } catch (e) {}
                    await sleep(randFloat(500, 1000))
                }
            } else {
                console.log(`${LogIndent.ITEM}未找到领取积分按钮`)
            }
        } catch (e) {
            console.log(`${LogIndent.ITEM}领取积分异常: ${e.message}`)
        }
    }

    /**
     * 处理每日活动任务
     */
    async _processDailyActivities() {
        try {
            const tasks = await this.page.evaluate(() => {
                const result = []
                // 查找所有包含 DailySet 特征的链接
                document.querySelectorAll('.outline-0, .cursor-pointer, .mai').forEach(link => {
                    const href = link.getAttribute('href') || ''
                    if (!href || href === '#') return
                    if (href.indexOf('http') == -1) return

                    // 提取积分
                    let points = 0
                    const pointsEl = link.querySelector('.items-center p, .h-5 p')
                    if (pointsEl) {
                        const pointsText = pointsEl.textContent || ''
                        const pointsMatch = pointsText.match(/\+?(\d+)/)
                        if (pointsMatch) points = parseInt(pointsMatch[1], 10)
                    }
                    if (points <= 0) return

                    // 提取标题
                    const titleEl = link.querySelector('p.text-body1Strong, h3, .line-clamp-3')
                    let title = '未知每日活动'
                    if (titleEl) title = titleEl.innerText.trim().substring(0, 30)

                    // 查找已完成标志（绿色勾勾）
                    const isCompleted = link.querySelector('.bg-statusSuccessRewardsBg') !== null

                    result.push({
                        href,
                        text: title,
                        points,
                        isCompleted
                    })
                })
                return result
            })

            if (!tasks.length) {
                console.log(`${LogIndent.ITEM}未发现每日活动`)
                return
            }

            // 去重
            const seen = new Set()
            const unique = tasks.filter(t => !seen.has(t.href) && seen.add(t.href))
            const pending = unique.filter(t => !t.isCompleted)

            this.stats.daily.total = unique.length
            this.stats.daily.done = unique.filter(t => t.isCompleted).length

            console.log(`${LogIndent.ITEM}每日活动: 待处理 ${pending.length}, 已完成 ${this.stats.daily.done}, 总计 ${unique.length}`)

            for (let i = 0; i < pending.length; i++) {
                const task = pending[i]
                console.log(`${LogIndent.ITEM}每日活动 ${task.text} (${i + 1}/${pending.length}) ${task.text} (+${task.points}分)`)

                const clicked = await this.page.evaluate((href) => {
                    const links = document.querySelectorAll('a[href]')
                    for (const link of links) {
                        if (link.getAttribute('href') === href) {
                            link.click()
                            return true
                        }
                    }
                    return false
                }, task.href)

                if (clicked) {
                    await sleep(randFloat(5000, 8000))
                    await this._closeExtraTabs(this.page)
                    await sleep(randFloat(1000, 2000))
                    this.stats.daily.done++
                }
            }
        } catch (e) {
            console.log(`${LogIndent.ITEM}每日活动异常: ${e.message}`)
        }
    }

    /**
     * 处理打卡任务
     */
    async _processPunchCards() {
        try {
            // 解析打卡卡片：查找 "X/Y 个任务" 格式
            const punchCards = await this.page.evaluate(() => {
                const cards = []
                // 查找所有包含 "个任务" 文本的元素
                document.querySelectorAll('a[href*="/earn/"]').forEach(link => {
                    const href = link.getAttribute('href') || ''
                    if (!href.includes('punchcard') && !href.includes('quest')) return

                    // 查找 "X/Y 个任务" 格式
                    const taskText = link.querySelector('.items-center > .text-fgCtrlNeutralSecondaryRest')?.textContent || ''
                    const match = taskText.match(/(\d+)\/(\d+)\s*个任务/)
                    if (match) {
                        const progress = parseInt(match[1], 10)
                        const total = parseInt(match[2], 10)
                        const isCompleted = progress >= total

                        cards.push({
                            href,
                            progress,
                            total,
                            isCompleted
                        })
                    }
                })
                return cards
            })

            if (!punchCards.length) {
                console.log(`${LogIndent.ITEM}未发现打卡任务`)
                return
            }

            // 过滤出未完成的任务
            const pendingCards = punchCards.filter(c => !c.isCompleted)
            const completedCount = punchCards.filter(c => c.isCompleted).length

            this.stats.punch.total = punchCards.length
            this.stats.punch.done = completedCount

            console.log(`${LogIndent.ITEM}打卡任务: 已完成 ${completedCount}/${punchCards.length}，待处理 ${pendingCards.length}`)

            if (!pendingCards.length) {
                console.log(`${LogIndent.ITEM}所有打卡任务已完成`)
                return
            }

            for (let i = 0; i < pendingCards.length; i++) {
                const card = pendingCards[i]
                try {
                    const fullUrl = card.href.startsWith('/') ? `${REWARDS_BASE_URL}${card.href}` : card.href
                    console.log(`${LogIndent.ITEM}打卡任务 (${i + 1}/${pendingCards.length}) ${card.progress}/${card.total}`)

                    const punchTab = await this.browser.newPage()
                    await punchTab.goto(fullUrl, { waitUntil: 'networkidle', timeout: 45000 })
                    await sleep(randFloat(3000, 5000))

                    await this._processPunchCardTasks(punchTab)
                    await punchTab.close()
                    await sleep(randFloat(1000, 2000))
                    this.stats.punch.done++
                } catch (e) {
                    console.log(`${LogIndent.ITEM}打卡任务处理失败: ${e.message}`)
                }
            }
        } catch (e) {
            console.log(`${LogIndent.ITEM}打卡任务流程异常: ${e.message}`)
        }
    }

    /**
     * 处理打卡子任务
     */
    async _processPunchCardTasks(tab) {
        try {
            const tasks = await tab.evaluate(() => {
                const result = []
                document.querySelectorAll('.flex-row.gap-2.sm\\:gap-4').forEach((row, idx) => {
                    const isCompleted = !!row.querySelector('.bg-statusSuccessRewardsBg')

                    // 查找链接 - 尝试多种选择器
                    let link = row.querySelector('a.bg-brandBg1')

                    // 尝试查找行内的第一个链接
                    if (!link) link = row.querySelector('a[href]')

                    // 尝试查找包含特定样式类的链接
                    if (!link) link = row.querySelector('a.cursor-pointer, a.outline-0, a.group\\/ctrl')

                    let href = ''
                    if (link) href = link.getAttribute('href') || ''
                    result.push({
                        href: href,
                        isCompleted,
                        index: idx,
                        text: row.innerText.trim().substring(0, 5)
                    })
                })
                return result
            })

            if (!tasks.length) {
                console.log(`${LogIndent.ITEM}       └── 未发现子任务`)
                return
            }

            const pending = tasks.filter(t => !t.isCompleted && t.href != '')
            this.stats.punch.total += tasks.length
            this.stats.punch.done += tasks.filter(t => t.isCompleted).length

            if (!pending.length) {
                console.log(`${LogIndent.ITEM}       └── 子任务已全部完成`)
                return
            }

            for (let i = 0; i < pending.length; i++) {
                const task = pending[i]
                console.log(`${LogIndent.ITEM}       ├── 执行 ${task.text} (${i + 1}/${pending.length})`)

                const clicked = await tab.evaluate((href) => {
                    // 查找包含该 href 的链接并点击
                    const links = document.querySelectorAll('a[href]')
                    for (const link of links) {
                        if (link.getAttribute('href') === href) {
                            link.click()
                            return true
                        }
                    }
                    return false
                }, task.href)

                if (clicked) {
                    await sleep(randFloat(5000, 8000))
                    await this._closeExtraTabs(tab)
                    await sleep(randFloat(1000, 2000))
                    this.stats.punch.done++
                }
            }
        } catch (e) {
            console.log(`${LogIndent.ITEM}打卡子任务异常: ${e.message}`)
        }
    }

    /**
     * 处理活动任务
     */
    async _processActivities() {
        try {
            const tasks = await this.page.evaluate(() => {
                const result = []
                const section = document.querySelector('#moreactivities')
                if (section) {
                    section.querySelectorAll('a[href]').forEach(link => {
                        const href = link.getAttribute('href') || ''
                        if (!href || href === '#') return

                        // 积分标签
                        const text = link.textContent || ''
                        const pointsMatch = link.querySelector('.items-center')?.textContent.match(/(\d+)/) || 0
                        if (pointsMatch == 0) return

                        // 查找已完成标志（绿色勾勾）
                        const isCompleted = link.querySelector('.bg-statusSuccessRewardsBg') !== null
                        const titleEl = link.querySelector('.line-clamp-3.text-globalBody2Strong')
                        const title = titleEl ? titleEl.innerText.trim().substring(0, 30) : '未知'

                        // 积分任务
                        const points = parseInt(pointsMatch[1], 10)
                        result.push({
                            href,
                            text: title,
                            points,
                            isCompleted
                        })
                    })
                }
                return result
            })

            if (!tasks.length) {
                console.log(`${LogIndent.ITEM}未发现活动任务`)
                return
            }

            const seen = new Set()
            const unique = tasks.filter(t => !seen.has(t.href) && seen.add(t.href))
            const pending = unique.filter(t => !t.isCompleted)

            this.stats.activity.total = unique.length
            this.stats.activity.done = unique.filter(t => t.isCompleted).length

            console.log(`${LogIndent.ITEM}活动任务: 待处理 ${pending.length}, 已完成 ${this.stats.activity.done}, 总计 ${unique.length}`)

            for (let i = 0; i < pending.length; i++) {
                const task = pending[i]
                console.log(`${LogIndent.ITEM}(${i + 1}/${pending.length}) ${task.text} (+${task.points}分)`)

                const clicked = await this.page.evaluate((href) => {
                    // 查找包含该 href 的链接并点击
                    const links = document.querySelectorAll('a[href]')
                    for (const link of links) {
                        if (link.getAttribute('href') === href) {
                            link.click()
                            return true
                        }
                    }
                    return false
                }, task.href)

                if (clicked) {
                    await sleep(randFloat(5000, 8000))
                    await this._closeExtraTabs(this.page)
                    await sleep(randFloat(1000, 2000))
                    this.stats.activity.done++
                }
            }
        } catch (e) {
            console.log(`${LogIndent.ITEM}活动任务异常: ${e.message}`)
        }
    }

    /**
     * 关闭多余标签页
     */
    async _closeExtraTabs(keepTab) {
        try {
            const pages = this.browser.pages()
            for (const page of pages) {
                if (page !== keepTab && page !== this.page) {
                    try { await page.close(); } catch (e) {}
                }
            }
        } catch (e) {}
    }
}

module.exports = { PointsManager, PointsPageManager }
