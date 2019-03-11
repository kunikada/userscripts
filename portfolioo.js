// @ts-check
// ==UserScript==
// @name         Portfolioo!
// @description  support Yahoo! Finance portfolio.
// @namespace    http://tampermonkey.net/
// @version      1.1
// @author       kunikada
// @updateURL    https://raw.githubusercontent.com/kunikada/userscripts/master/portfolioo.js
// @downloadURL  https://raw.githubusercontent.com/kunikada/userscripts/master/portfolioo.js
// @match        https://info.finance.yahoo.co.jp/portfolio/display/?portfolio_id=pf_1*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

String.prototype.parseWithComma =  function() {
    return parseInt(this.replace(/,/g, ''));
}
Number.prototype.toYen = function(unit = '円') {
    return this.toLocaleString('ja', {maximumFractionDigits: 0}) + unit;
}

class Instrument {
    /**
     * @param {string} id 
     */
    constructor(id) {
        this.id = id;
        this.code /** @type {string} */ = '';
        this.amount /** @type {number} */ = 0;
        this.amountGoal /** @type {number} */ = 0;
    }

    /**
     * @return {number}
     */
    get category() {
        switch (this.code) {
            case '03319172':
            case '29316153':
            case '64317168':
            case '9I312179':
                return 1; // 先進国株
            case '0331C177':
            case '2931517A':
                return 2; // 新興国株
            case '03317172':
            case '29312154':
                return 3; // 国内大型株
            case '09311143':
                return 4; // 国内中小型株
            case '2931213C':
            case '4731216A':
                return 5; // 先進国債券
            case '0431U169':
                return 6; // 新興国債券
            case '03318172':
            case '29314151':
                return 7; // 国内債券
            case '6431717B':
                return 8; // 金
            case 'AJ319178':
                return 9; // 先進国REIT
            case 'AJ318178':
                return 10; // 国内REIT
            case 'cash':
                return 11;
        }
        return 0;
    }

    /** @return {number} */
    get rateGoal() {
        switch (this.category) {
            case 1: // 先進国株
                return 0.28;
            case 2: // 新興国株
                return 0.05;
            case 3: // 国内大型株
                return 0.15;
            case 4: // 国内中小型株
                return 0.06;
            case 5: // 先進国債券
                return 0.05;
            case 6: // 新興国債券
                return 0.04;
            case 7: // 国内債券
                return 0.05;
            case 8: // 金
                return 0.04;
            case 9: // 先進国REIT
                return 0.09;
            case 10: // 国内REIT
                return 0.09;
            case 11: // 現金
                return 0.1;
        }
        return 0;
    }

    /**
     * @param {number} categorySum
     * @param {number} totalSum 
     */
    calc(totalSum = 0, categorySum = 0) {
        let categoryGoal = totalSum * this.rateGoal;
        this.amountGoal = this.amount + (categoryGoal - categorySum);

        if (this.id === 'viewItem0') {
            return;
        }
        document.getElementById(this.id + 'Amount').innerHTML = `
            ${this.amount.toYen()}<br>
            ${this.amountGoal.toYen()}<br>
            ${(this.amountGoal - this.amount).toYen()}
            `;
    }
}

class Instruments {
    constructor() {
        this.instruments /** @type {Instrument[]} */ = [];
        this.totalSum /** @type {number} */ = 0;
        this.categorySums /** @type {number[]} */ = [];
    }

    /**
     * @param {Instrument} instrument 
     */
    add(instrument) {
        this.instruments.push(instrument);
        this.totalSum += instrument.amount;
        if (!this.categorySums[instrument.category]) {
            this.categorySums[instrument.category] = 0;
        }
        this.categorySums[instrument.category] += instrument.amount;
    }

    /**
     * @param {string} id 
     */
    getById(id) {
        return this.instruments.find(instrument => instrument.id === id);
    }

    calcAll() {
        for (let instrument of this.instruments) {
            instrument.calc(this.totalSum, this.categorySums[instrument.category]);
        }
    }
}

(async () => {
    'use strict';

    const href = location.href;

    // sleep定義
    const sleep = ( /** @type {number} */ seconds) => new Promise((resolve) => setTimeout(() => resolve(), seconds * 1000))
    await sleep(0.5);

    if (href.includes('https://info.finance.yahoo.co.jp/portfolio/display/?portfolio_id=pf_1')) {
        const instruments = new Instruments;

        const cash = new Instrument('viewItem0');
        cash.code = 'cash';
        cash.amount = GM_getValue('cash', 0);
        instruments.add(cash);

        const items = document.querySelectorAll('#tbodyPortfolio tr td[id^=viewItem]');
        let tempItems = {};
        for (let item of items) {
            let instrument = tempItems[item.id];
            if (!instrument) {
                instrument = new Instrument(item.id);
                tempItems[item.id] = instrument;
            }
            if (!item.innerHTML.includes('floatL')) {
                continue;
            }
            let key = item.querySelector('div.floatL').textContent;
            let value = item.querySelector('div.floatR').textContent;
            if (key === 'コード') {
                instrument.code = value;
            } else if (key === '時価' && value !== '---') {
                instrument.amount = value.parseWithComma();
                instruments.add(instrument);

                item.querySelector('div.floatL').innerHTML = '時価<br>適正<br>差分'
                item.querySelector('div.floatR em').setAttribute('id', item.id + 'Amount');
            }
        }
        instruments.calcAll();

        let tr = document.createElement('tr');
        tr.innerHTML = `
            <td>総合計: ${instruments.totalSum.toYen()}</td>
            <td>現金:<input id="cash" type="text" value="${cash.amount.toYen('')}" style="width:6em;text-align:right;">円</td>
            <td>適正: ${cash.amountGoal.toYen()}</td>
            <td>差分: ${(cash.amountGoal - cash.amount).toYen()}</td>
            `;
        const pfMyTotal = document.querySelector('.pfMyTotal tbody').appendChild(tr);
        document.querySelector('#cash').onblur = function() {
            GM_setValue('cash', this.value.parseWithComma());
            location.reload();
        }
    }
})();
