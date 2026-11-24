(function () {
  'use strict';

  const MODULES = new Set([
    'geral', 'segmento', 'contexto_industrial', 'ppcp',
    'automacao', 'dados_bi', 'administrativo', 'projetos'
  ]);

  function moduleForQuestion(question) {
    const moduleId = String(question?.mod || 'geral');
    if (moduleId === 'ramo' || moduleId === 'produto') return 'contexto_industrial';
    return MODULES.has(moduleId) ? moduleId : null;
  }

  function splitAssessment(assessment, questions) {
    if (!assessment || assessment.schema !== 'm360-assessment' || !assessment.context) {
      throw new Error('Formato de avaliação incompatível.');
    }
    const questionModules = new Map();
    (Array.isArray(questions) ? questions : []).forEach((question) => {
      const moduleId = moduleForQuestion(question);
      if (question?.id && moduleId) questionModules.set(question.id, moduleId);
    });

    const answersByModule = Object.fromEntries([...MODULES].map((id) => [id, {}]));
    const unmappedAnswers = {};
    Object.entries(assessment.answers || {}).forEach(([questionId, answer]) => {
      const moduleId = questionModules.get(questionId);
      if (!moduleId) unmappedAnswers[questionId] = answer;
      else answersByModule[moduleId][questionId] = answer;
    });

    const sharedPayload = { ...assessment };
    delete sharedPayload.answers;
    if (Object.keys(unmappedAnswers).length) {
      sharedPayload.legacy_unmapped_answers = unmappedAnswers;
    }
    return { sharedPayload, answersByModule, unmappedCount: Object.keys(unmappedAnswers).length };
  }

  function mergeAssessment(sharedPayload, modules) {
    if (!sharedPayload || typeof sharedPayload !== 'object' || Array.isArray(sharedPayload) || Object.prototype.hasOwnProperty.call(sharedPayload, 'answers')) {
      throw new Error('Dados compartilhados inválidos.');
    }
    const legacyAnswers = sharedPayload.legacy_unmapped_answers && typeof sharedPayload.legacy_unmapped_answers === 'object' && !Array.isArray(sharedPayload.legacy_unmapped_answers)
      ? sharedPayload.legacy_unmapped_answers : {};
    const assessment = { ...sharedPayload, answers: { ...legacyAnswers } };
    delete assessment.legacy_unmapped_answers;
    (Array.isArray(modules) ? modules : []).forEach((module) => {
      if (!MODULES.has(module.module_id) || !module.answers || typeof module.answers !== 'object' || Array.isArray(module.answers)) return;
      Object.entries(module.answers).forEach(([questionId, answer]) => {
        if (Object.prototype.hasOwnProperty.call(assessment.answers, questionId)) {
          throw new Error('Resposta duplicada entre módulos ou dados arquivados: ' + questionId);
        }
        assessment.answers[questionId] = answer;
      });
    });
    return assessment;
  }

  async function getSession() {
    // account-menu.js é um módulo ES; sua inicialização pode ocorrer depois
    // dos scripts defer clássicos. Aguarda a API global de autenticação.
    const startedAt = Date.now();
    while (!window.M360Auth?.getSession && Date.now() - startedAt < 10000) {
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    if (!window.M360Auth?.getSession) {
      throw new Error('Não foi possível inicializar a autenticação. Atualize a página e tente novamente.');
    }
    const session = await window.M360Auth.getSession();
    if (!session?.access_token || !session.user) throw new Error('Sua sessão expirou. Entre novamente na conta para acessar a avaliação.');
    return session;
  }

  async function request(path, options) {
    const session = await getSession();
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
        Authorization: 'Bearer ' + session.access_token
      },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || 'Não foi possível acessar a avaliação.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  window.M360CompanyAssessment = Object.freeze({
    version: 1,
    moduleForQuestion,
    splitAssessment,
    mergeAssessment,
    list: () => request('/api/company-assessments', { method: 'GET' }),
    create: (payload) => request('/api/company-assessments', { method: 'POST', body: JSON.stringify(payload) }),
    load: (assessmentId) => request('/api/company-assessment-module?assessment_id=' + encodeURIComponent(assessmentId), { method: 'GET' }),
    assign: (payload) => request('/api/company-assessment-module', { method: 'POST', body: JSON.stringify({ ...payload, action: 'assign' }) }),
    updateShared: (payload) => request('/api/company-assessment-module', { method: 'POST', body: JSON.stringify({ ...payload, action: 'update_shared' }) }),
    saveModule: (payload) => request('/api/company-assessment-module', { method: 'POST', body: JSON.stringify({ ...payload, action: 'save' }) }),
    completeTriage: (assessmentId) => request('/api/company-assessment-module', { method: 'POST', body: JSON.stringify({ action: 'complete_triage', assessment_id: assessmentId, module_id: 'geral' }) }),
    advanceStage: (assessmentId, nextStage) => request('/api/company-assessment-module', { method: 'POST', body: JSON.stringify({ action: 'advance_stage', assessment_id: assessmentId, next_stage: nextStage }) }),
    complete: (assessmentId) => request('/api/company-assessment-module', { method: 'POST', body: JSON.stringify({ action: 'complete', assessment_id: assessmentId }) })
  });
})();
