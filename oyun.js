(() => {
  "use strict";

  const questions = window.GAME_QUESTIONS;
  let questionSeconds = 30;
  const maxQuestions = questions.length;
  const teamNames = ["", ""];
  const teamSizes = [0, 0];
  const remainingPlayers = [[], []];
  const scores = [0, 0];
  let questionIndex = 0;
  let secondsLeft = questionSeconds;
  let timerId = null;
  let drawIntervalId = null;
  let transitionId = null;
  let selectedPlayerNumbers = [0, 0];
  let acceptingAnswer = false;
  let gameFinished = false;
  let soundEnabled = true;
  let audioContext = null;

  const byId = (id) => document.getElementById(id);
  const setupPanel = byId("setup-panel");
  const playPanel = byId("play-panel");
  const resultOverlay = byId("result-overlay");
  const questionStage = byId("question-stage");
  const roundStartButton = byId("round-start-button");
  const consentOverlay = byId("consent-overlay");
  const consentCheckbox = byId("consent-checkbox");
  const consentButton = byId("consent-button");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (consentOverlay && consentCheckbox && consentButton) {
    consentCheckbox.addEventListener("change", () => {
      consentButton.disabled = !consentCheckbox.checked;
    });
    consentButton.addEventListener("click", () => {
      if (!consentCheckbox.checked) return;
      consentOverlay.hidden = true;
      byId("start-button").focus();
    });
    consentOverlay.hidden = false;
    consentButton.disabled = true;
  }

  for (const selectId of ["team1-size", "team2-size"]) {
    const select = byId(selectId);
    for (let count = 1; count <= 30; count += 1) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = `${count} kişi`;
      select.append(option);
    }
    select.value = String(maxQuestions);
  }

  const roundSecondsSelect = byId("round-seconds");
  for (let seconds = 10; seconds <= 120; seconds += 10) {
    const option = document.createElement("option");
    option.value = String(seconds);
    option.textContent = seconds >= 60 && seconds % 60 === 0
      ? `${seconds / 60} dakika`
      : `${seconds} saniye`;
    roundSecondsSelect.append(option);
  }
  roundSecondsSelect.value = "30";

  function shufflePlayers(count) {
    const players = Array.from({ length: count }, (_, index) => index + 1);
    for (let index = players.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [players[index], players[swapIndex]] = [players[swapIndex], players[index]];
    }
    return players;
  }

  function playTone(frequency, duration = 0.16, volume = 0.035, delay = 0) {
    if (!soundEnabled || !AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = audioContext.currentTime + delay;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  function playSound(kind) {
    if (kind === "draw") {
      playTone(523, 0.24, 0.035);
      playTone(659, 0.3, 0.03, 0.12);
    } else if (kind === "correct") {
      playTone(587, 0.2, 0.04);
      playTone(784, 0.3, 0.035, 0.13);
    } else if (kind === "incorrect") {
      playTone(392, 0.22, 0.025);
    } else if (kind === "finish") {
      playTone(523, 0.25, 0.035);
      playTone(659, 0.25, 0.035, 0.15);
      playTone(784, 0.38, 0.035, 0.3);
    }
  }

  function unlockAudio() {
    if (!soundEnabled || !AudioContextClass) return;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
  }

  function renderScores() {
    byId("score1").textContent = String(scores[0]);
    byId("score2").textContent = String(scores[1]);
  }

  function renderTimer() {
    byId("timer").textContent = String(secondsLeft);
    byId("timer-progress").style.width = `${(secondsLeft / questionSeconds) * 100}%`;
    byId("timer").classList.toggle("timer-low", secondsLeft <= 10);
  }

  function prepareAnswerButtons(question) {
    for (let teamIndex = 0; teamIndex < 2; teamIndex += 1) {
      const container = byId(`options${teamIndex + 1}`);
      container.replaceChildren();
      question.options.forEach((optionText, optionIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "option-button";
        const letter = document.createElement("span");
        letter.className = "option-letter";
        letter.textContent = String.fromCharCode(65 + optionIndex);
        const text = document.createElement("span");
        text.className = "option-text";
        text.textContent = optionText;
        button.append(letter, text);
        button.addEventListener("click", () => submitAnswer(teamIndex, optionIndex));
        container.append(button);
      });
    }
  }

  function selectPlayers() {
    if (gameFinished) return;
    if (questionIndex >= maxQuestions) {
      finishGame();
      return;
    }
    if (remainingPlayers[0].length === 0 || remainingPlayers[1].length === 0) {
      byId("round-instruction").textContent = "Oyuncular bitti. Maç sona erdi.";
      finishGame();
      return;
    }

    clearInterval(timerId);
    acceptingAnswer = false;
    questionStage.hidden = true;
    roundStartButton.hidden = true;
    byId("round-instruction").textContent = "Numaralar çekiliyor…";
    byId("feedback").textContent = "";
    byId("feedback").className = "feedback";
    byId("draw1").classList.add("is-drawing");
    byId("draw2").classList.add("is-drawing");
    byId("draw1-caption").textContent = "OYUNCU SEÇİLİYOR";
    byId("draw2-caption").textContent = "OYUNCU SEÇİLİYOR";

    selectedPlayerNumbers = [remainingPlayers[0].shift(), remainingPlayers[1].shift()];

    clearInterval(drawIntervalId);
    drawIntervalId = window.setInterval(() => {
      byId("draw1").textContent = String(remainingPlayers[0][Math.floor(Math.random() * remainingPlayers[0].length)] || selectedPlayerNumbers[0]);
      byId("draw2").textContent = String(remainingPlayers[1][Math.floor(Math.random() * remainingPlayers[1].length)] || selectedPlayerNumbers[1]);
    }, 85);

    transitionId = window.setTimeout(() => {
      clearInterval(drawIntervalId);
      byId("draw1").textContent = String(selectedPlayerNumbers[0]);
      byId("draw2").textContent = String(selectedPlayerNumbers[1]);
      byId("draw1").classList.remove("is-drawing");
      byId("draw2").classList.remove("is-drawing");
      byId("draw1-caption").textContent = `OYUNCU ${selectedPlayerNumbers[0]}`;
      byId("draw2-caption").textContent = `OYUNCU ${selectedPlayerNumbers[1]}`;
      byId("round-instruction").textContent = "Oyuncular belli oldu. Soruyu açalım mı?";
      roundStartButton.hidden = false;
      roundStartButton.focus();
      playSound("draw");
    }, 1150);
  }

  function startQuestion() {
    if (questionIndex >= maxQuestions) {
      finishGame();
      return;
    }
    if (roundStartButton.hidden) return;
    roundStartButton.hidden = true;
    byId("round-instruction").textContent = "Cevabınızı seçin. Doğru cevap 100 puan!";
    const question = questions[questionIndex];
    byId("question-counter").innerHTML = `SORU ${String(questionIndex + 1).padStart(2, "0")} <i>/ ${maxQuestions}</i>`;
    byId("question-text").textContent = question.q;
    byId("answer-team1").classList.remove("is-locked", "is-correct", "is-wrong");
    byId("answer-team2").classList.remove("is-locked", "is-correct", "is-wrong");
    byId("answer1-status").textContent = "Sıra sizde";
    byId("answer2-status").textContent = "Sıra sizde";
    byId("draw1-caption").textContent = `OYUNCU ${selectedPlayerNumbers[0]} • CEVAPLA`;
    byId("draw2-caption").textContent = `OYUNCU ${selectedPlayerNumbers[1]} • CEVAPLA`;
    prepareAnswerButtons(question);
    questionStage.hidden = false;
    acceptingAnswer = true;
    secondsLeft = questionSeconds;
    renderTimer();
    timerId = window.setInterval(() => {
      secondsLeft -= 1;
      renderTimer();
      if (secondsLeft <= 0) endQuestion(null);
    }, 1000);
  }

  function submitAnswer(teamIndex, optionIndex) {
    if (!acceptingAnswer || secondsLeft <= 0) return;
    endQuestion({ teamIndex, optionIndex });
  }

  function endQuestion(response) {
    if (!acceptingAnswer || gameFinished) return;
    acceptingAnswer = false;
    clearInterval(timerId);
    const question = questions[questionIndex];
    const correctButtonIndex = question.answer;

    document.querySelectorAll(".option-button").forEach((button) => {
      button.disabled = true;
    });

    byId("answer-team1").classList.add("is-locked");
    byId("answer-team2").classList.add("is-locked");
    byId("answer-team1").querySelectorAll(".option-button")[correctButtonIndex].classList.add("is-answer");
    byId("answer-team2").querySelectorAll(".option-button")[correctButtonIndex].classList.add("is-answer");

    if (!response) {
      byId("feedback").textContent = `Süre bitti! Doğru cevap ${String.fromCharCode(65 + question.answer)}: ${question.options[question.answer]}.`;
      byId("answer1-status").textContent = "Süre bitti";
      byId("answer2-status").textContent = "Süre bitti";
    } else {
      const isCorrect = response.optionIndex === question.answer;
      const teamPanel = byId(`answer-team${response.teamIndex + 1}`);
      const otherTeamIndex = 1 - response.teamIndex;
      const respondingButton = byId(`options${response.teamIndex + 1}`).children[response.optionIndex];
      respondingButton.classList.add("is-selected");
      teamPanel.classList.add(isCorrect ? "is-correct" : "is-wrong");
      byId(`answer${response.teamIndex + 1}-status`).textContent = isCorrect ? "+100 puan" : "Olmadı";
      byId(`answer${otherTeamIndex + 1}-status`).textContent = "Tur bitti";
      if (isCorrect) {
        scores[response.teamIndex] += 100;
        renderScores();
        byId("feedback").textContent = `${teamNames[response.teamIndex]} bildi! 100 puan kazandı.`;
        playSound("correct");
      } else {
        scores[otherTeamIndex] += 100;
        renderScores();
        byId(`answer${otherTeamIndex + 1}-status`).textContent = "+100 puan";
        byId("feedback").textContent = `${teamNames[response.teamIndex]} bilemedi. 100 puan ${teamNames[otherTeamIndex]} takımına!`;
        playSound("correct");
      }
    }

    byId("feedback").className = "feedback is-visible";
    questionIndex += 1;
    if (questionIndex >= maxQuestions) {
      byId("round-instruction").textContent = `${maxQuestions} soru da tamamlandı!`;
      finishGame();
    } else {
      transitionId = window.setTimeout(selectPlayers, 1900);
    }
  }

  function finishGame() {
    if (gameFinished) return;
    gameFinished = true;
    clearInterval(timerId);
    clearInterval(drawIntervalId);
    clearTimeout(transitionId);
    acceptingAnswer = false;
    document.querySelectorAll(".option-button").forEach((button) => {
      button.disabled = true;
    });

    const winner = scores[0] === scores[1] ? null : (scores[0] > scores[1] ? 0 : 1);
    byId("result-title").textContent = winner === null ? "Berabere!" : `${teamNames[winner]} kazandı!`;
    byId("result-message").textContent = questionIndex < maxQuestions
      ? "Oyuncular bittiği için maç burada sona erdi."
      : winner === null
        ? "İkiniz de aynı puanı aldınız."
        : "Tebrikler!";
    byId("result1-name").textContent = teamNames[0];
    byId("result2-name").textContent = teamNames[1];
    byId("result1-score").textContent = String(scores[0]);
    byId("result2-score").textContent = String(scores[1]);
    resultOverlay.hidden = false;
    byId("restart-button").focus();
    playSound("finish");
  }

  function startGame() {
    unlockAudio();
    gameFinished = false;
    questionSeconds = Number(roundSecondsSelect.value);
    teamNames[0] = byId("team1-name").value.trim() || "1. Takım";
    teamNames[1] = byId("team2-name").value.trim() || "2. Takım";
    teamSizes[0] = Number(byId("team1-size").value);
    teamSizes[1] = Number(byId("team2-size").value);
    remainingPlayers[0] = shufflePlayers(teamSizes[0]);
    remainingPlayers[1] = shufflePlayers(teamSizes[1]);
    scores[0] = 0;
    scores[1] = 0;
    questionIndex = 0;
    secondsLeft = questionSeconds;

    byId("score1-name").textContent = teamNames[0];
    byId("score2-name").textContent = teamNames[1];
    byId("draw1-name").textContent = teamNames[0].toLocaleUpperCase("tr-TR");
    byId("draw2-name").textContent = teamNames[1].toLocaleUpperCase("tr-TR");
    byId("answer1-name").textContent = teamNames[0];
    byId("answer2-name").textContent = teamNames[1];
    renderScores();
    renderTimer();
    setupPanel.hidden = true;
    playPanel.hidden = false;
    resultOverlay.hidden = true;
    document.body.classList.add("game-active");
    selectPlayers();
  }

  byId("start-button").addEventListener("click", () => {
    if (consentOverlay && consentOverlay.hidden === false) {
      consentOverlay.hidden = false;
      consentCheckbox.checked = false;
      consentButton.disabled = true;
      return;
    }
    startGame();
  });
  roundStartButton.addEventListener("click", startQuestion);
  byId("sound-toggle").addEventListener("click", (event) => {
    soundEnabled = !soundEnabled;
    event.currentTarget.textContent = soundEnabled ? "Ses açık" : "Ses kapalı";
    event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));
    if (soundEnabled) playSound("draw");
  });
  byId("restart-button").addEventListener("click", () => {
    resultOverlay.hidden = true;
    playPanel.hidden = true;
    setupPanel.hidden = false;
    document.body.classList.remove("game-active");
    byId("start-button").focus();
  });
})();
